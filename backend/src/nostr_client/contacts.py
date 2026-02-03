import asyncio
import time
from .utils import normalize_pubkey_input

from .config import RELAYS, CONTACTS_FETCH_TIMEOUT, CONTACTS_KIND
from .relay_manager import RelayManager



relay_manager = RelayManager()

# Cache: pubkey -> set of followed pubkeys
_FOLLOWING_CACHE: dict[str, set[str]] = {}

def parse_following_from_kind3(event: dict | None) -> set[str]:
    follows: set[str] = set()
    if not event:
        return follows

    for t in event.get("tags", []) or []:
        if isinstance(t, list) and len(t) >= 2 and t[0] == "p":
            pk = t[1]
            if isinstance(pk, str) and len(pk) == 64:
                follows.add(pk.lower())
    return follows


async def fetch_latest_contacts_event_from_relay(relay_url: str, my_pubkey: str) -> dict | None:
    """
    Fetch latest kind:3 contacts event (not just the pubkeys) from one relay.
    """
    sub_id = relay_manager.new_sub_id()
    req = relay_manager.make_req(
        sub_id,
        {"authors": [my_pubkey], "kinds": [CONTACTS_KIND], "limit": 1},
    )
    latest_event: dict | None = None

    try:
        async with relay_manager.connect(relay_url) as ws:
            await relay_manager.send(ws, req)

            start = time.time()
            while True:
                if time.time() - start > CONTACTS_FETCH_TIMEOUT:
                    break

                try:
                    msg = await relay_manager.recv_json(ws, timeout=CONTACTS_FETCH_TIMEOUT)
                except asyncio.TimeoutError:
                    break

                if not msg:
                    continue

                if msg[0] == "EVENT":
                    _, got_sub, ev = msg
                    if got_sub != sub_id:
                        continue
                    if latest_event is None or ev.get("created_at", 0) > latest_event.get("created_at", 0):
                        latest_event = ev

                elif msg[0] == "EOSE":
                    _, got_sub = msg
                    if got_sub == sub_id:
                        break

    except Exception as e:
        print(f"⚠️  contacts fetch failed {relay_url}: {type(e).__name__}: {e}")
        return None

    return latest_event


async def fetch_latest_contacts_event_all_relays(my_pubkey: str) -> dict | None:
    """
    Try all relays; return the newest contacts event we find.
    """
    events = await asyncio.gather(*(fetch_latest_contacts_event_from_relay(r, my_pubkey) for r in RELAYS))
    newest = None
    for ev in events:
        if not ev:
            continue
        if newest is None or ev.get("created_at", 0) > newest.get("created_at", 0):
            newest = ev
    return newest


async def fetch_following_all_relays(my_pubkey: str) -> set[str]:
    # Check cache first
    if my_pubkey in _FOLLOWING_CACHE:
        return _FOLLOWING_CACHE[my_pubkey]
    
    print(f"[CONTACTS] Cache miss for {my_pubkey[:8]}, fetching from relays...")
    latest = await fetch_latest_contacts_event_all_relays(my_pubkey)
    following = parse_following_from_kind3(latest)
    
    # Update cache
    _FOLLOWING_CACHE[my_pubkey] = following
    return following


def update_following_cache(my_pubkey: str, new_set: set[str]):
    _FOLLOWING_CACHE[my_pubkey] = new_set


def apply_follow(current: set[str], pubkey_input: str) -> set[str]:
    pk = normalize_pubkey_input(pubkey_input)
    return set(current) | {pk}


def apply_unfollow(current: set[str], pubkey_input: str) -> set[str]:
    pk = normalize_pubkey_input(pubkey_input)
    nxt = set(current)
    nxt.discard(pk)
    return nxt
async def fetch_followers_all_relays(my_pubkey: str) -> set[str]:
    """
    Fetch all unique pubkeys that follow 'my_pubkey'.
    We look for Kind 3 events where '#p' tag includes 'my_pubkey'.
    """
    # Filter: Kind 3 (Contacts), #p tag = my_pubkey
    req_filter = {"kinds": [CONTACTS_KIND], "#p": [my_pubkey], "limit": 1000}
    
    sub_id = relay_manager.new_sub_id()
    req = relay_manager.make_req(sub_id, req_filter)
    
    followers = set()

    async def fetch_from_relay(relay_url: str):
        try:
            async with relay_manager.connect(relay_url) as ws:
                await relay_manager.send(ws, req)
                
                start = time.time()
                while True:
                    if time.time() - start > CONTACTS_FETCH_TIMEOUT:
                        break

                    try:
                        msg = await relay_manager.recv_json(ws, timeout=CONTACTS_FETCH_TIMEOUT)
                    except asyncio.TimeoutError:
                        break

                    if not msg:
                        continue

                    if msg[0] == "EVENT":
                        _, got_sub, ev = msg
                        if got_sub == sub_id:
                            pubkey = ev.get("pubkey")
                            if pubkey:
                                followers.add(pubkey)

                    elif msg[0] == "EOSE":
                        _, got_sub = msg
                        if got_sub == sub_id:
                            break
        except:
            pass

    # Run in parallel
    await asyncio.gather(*(fetch_from_relay(r) for r in RELAYS))
    return followers


async def start_contact_watcher(my_pubkey: str):
    """
    Permanently subscribe to my own Kind 3 (Contact List) updates.
    If another client updates the list, we receive it here and update the cache instantly.
    """
    print(f"[CONTACTS] Starting background watcher for {my_pubkey[:8]}")
    
    # We'll use a dedicated RelayManager for this long-lived connection to avoid conflicts
    watcher_manager = RelayManager()
    
    sub_id = watcher_manager.new_sub_id()
    filters = {"authors": [my_pubkey], "kinds": [CONTACTS_KIND], "limit": 1} # We only need the latest one
    
    # We loop forever to handle reconnections
    while True:
        try:
            # We connect to one reliable relay or loop through them. 
            # For simplicity/robustness, let's just pick the first working one or broadcast.
            # Ideally, we want to listen to a few major relays.
            # Let's try to connect to the first relay in our list for now as a primary watcher.
            relay_url = RELAYS[0] 
            
            print(f"[CONTACTS] Watcher connecting to {relay_url}...")
            async with watcher_manager.connect(relay_url) as ws:
                req = watcher_manager.make_req(sub_id, filters)
                await watcher_manager.send(ws, req)
                
                while True:
                    msg = await watcher_manager.recv_json(ws)
                    if not msg:
                        continue
                        
                    if msg[0] == "EVENT":
                        _, got_sub, ev = msg
                        if got_sub == sub_id:
                            print(f"[CONTACTS] Watcher received update via {relay_url}!")
                            new_following = parse_following_from_kind3(ev)
                            
                            # Update cache safely
                            # (In a real app, we might check timestamps to ensure it's actually newer)
                            current_set = _FOLLOWING_CACHE.get(my_pubkey, set())
                            
                            # Simple logic: Trust the relay's latest event
                            update_following_cache(my_pubkey, new_following)
                            print(f"[CONTACTS] Cache updated (New count: {len(new_following)})")

                    # We don't break on EOSE, we keep listening for future updates
                    
        except Exception as e:
            print(f"[CONTACTS] Watcher error: {e}. Retrying in 5s...")
            await asyncio.sleep(5)
