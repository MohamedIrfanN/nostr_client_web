import asyncio
import time
from typing import Iterable

from .config import RELAYS
from .utils import require_32byte_hex
from .events import build_signed_mute_list
from .relay_manager import RelayManager


RECV_TIMEOUT = 3.0  # prevents "stuck"


relay_manager = RelayManager()

# Cache: pubkey -> set of muted pubkeys
_MUTE_LIST_CACHE: dict[str, set[str]] = {}

def update_mute_cache(my_pubkey: str, new_set: set[str]):
    _MUTE_LIST_CACHE[my_pubkey] = new_set

def _extract_mute_pubkeys(event: dict) -> set[str]:
    """
    kind:10000 list, tags include:
      ["p","<pubkey>"]
    """
    out: set[str] = set()
    for t in event.get("tags", []) or []:
        if not (isinstance(t, list) and len(t) >= 2):
            continue
        if t[0] != "p":
            continue
        pk = (t[1] or "").strip().lower()
        if len(pk) == 64:
            try:
                bytes.fromhex(pk)
                out.add(pk)
            except ValueError:
                pass
    return out


async def fetch_published_mute_set(my_pubkey: str) -> set[str]:
    """
    Fetch newest mute list from our relays (best effort).
    Returns a set of blocked pubkeys.
    """
    my_pubkey = require_32byte_hex(my_pubkey, "my pubkey")

    # Check cache first
    if my_pubkey in _MUTE_LIST_CACHE:
        return _MUTE_LIST_CACHE[my_pubkey]

    async def _from_relay(relay: str):
        sub_id = relay_manager.new_sub_id()
        req = relay_manager.make_req(
            sub_id,
            {"kinds": [10000], "authors": [my_pubkey]},
        )

        best = None
        try:
            async with relay_manager.connect(relay) as ws:
                await relay_manager.send(ws, req)

                while True:
                    try:
                        msg = await relay_manager.recv_json(ws, timeout=RECV_TIMEOUT)
                    except asyncio.TimeoutError:
                        break

                    if not msg:
                        continue

                    if msg[0] == "EOSE":
                        break

                    if msg[0] != "EVENT":
                        continue

                    ev = msg[2]
                    if best is None or int(ev.get("created_at", 0)) > int(best.get("created_at", 0)):
                        best = ev
        except Exception:
            return None

        return best

    results = await asyncio.gather(*(_from_relay(r) for r in RELAYS))
    events = [e for e in results if e]

    if not events:
        return set()

    newest = max(events, key=lambda e: int(e.get("created_at", 0)))
    mute_set = _extract_mute_pubkeys(newest)
    
    # Update cache
    _MUTE_LIST_CACHE[my_pubkey] = mute_set
    return mute_set


async def start_mute_watcher(my_pubkey: str):
    """
    Permanently subscribe to my own Kind 10000 (Mute List) updates.
    """
    print(f"[MUTE] Starting background watcher for {my_pubkey[:8]}")
    
    watcher_manager = RelayManager()
    sub_id = watcher_manager.new_sub_id()
    filters = {"authors": [my_pubkey], "kinds": [10000], "limit": 1}
    
    while True:
        try:
            relay_url = RELAYS[0] # Pick primary relay
            print(f"[MUTE] Watcher connecting to {relay_url}...")
            
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
                            print(f"[MUTE] Watcher received update via {relay_url}!")
                            new_mute_set = _extract_mute_pubkeys(ev)
                            update_mute_cache(my_pubkey, new_mute_set)
                            print(f"[MUTE] Cache updated (New count: {len(new_mute_set)})")

        except Exception as e:
            print(f"[MUTE] Watcher error: {e}. Retrying in 5s...")
            await asyncio.sleep(5)


async def publish_mute_set(privkey, blocked_set: Iterable[str]):
    """
    Publish updated mute list (kind:10000) to all relays.
    """
    clean = sorted({require_32byte_hex(pk, "blocked pubkey") for pk in blocked_set})
    eid, ev = build_signed_mute_list(privkey, clean)
    return eid, ev
