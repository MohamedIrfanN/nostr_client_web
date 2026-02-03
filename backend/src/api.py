import asyncio
import time
from datetime import datetime

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .nostr_client.utils import get_privkey_from_env, pubkey_xonly_hex, normalize_pubkey_input
from .nostr_client.config import RELAYS, AUTHOR_CHUNK_SIZE
from .nostr_client.events import (
    build_signed_text_note,
    build_signed_contacts_event,
    build_signed_dm,
    build_signed_reaction,
    build_signed_comment,
)
from .nostr_client.publish import publish_to_relays
from .nostr_client.contacts import fetch_following_all_relays, fetch_followers_all_relays, apply_follow, apply_unfollow, update_following_cache, start_contact_watcher
from .nostr_client.profile_search import fetch_profile_by_pubkey, search_profiles_by_name
from .nostr_client.dm_subscribe import fetch_dm_inbox_7d, fetch_dm_history_7d, _decrypt, _extract_partner
from .nostr_client.mute_list import fetch_published_mute_set, publish_mute_set, update_mute_cache, start_mute_watcher
from .nostr_client.feed import fetch_feed_events
from .nostr_client.relay_manager import RelayManager


app = FastAPI(title="nostr_client_web API")
relay_manager = RelayManager()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    _, my_pubkey = _get_keys()
    # Start the permanent contact list watcher in background
    asyncio.create_task(start_contact_watcher(my_pubkey))
    # Start the permanent mute list watcher
    asyncio.create_task(start_mute_watcher(my_pubkey))


class PublishIn(BaseModel):
    content: str


class FollowIn(BaseModel):
    pubkey: str


class DMMessageIn(BaseModel):
    partner_pubkey: str
    message: str


class ReactIn(BaseModel):
    event_id: str
    reaction: str = "+"


class CommentIn(BaseModel):
    event_id: str
    event_pubkey: str
    content: str


def _get_keys():
    privkey = get_privkey_from_env()
    my_pubkey = pubkey_xonly_hex(privkey)
    return privkey, my_pubkey



def _chunk(lst: list[str], size: int):
    for i in range(0, len(lst), size):
        yield lst[i : i + size]


async def _relay_stream_task(relay: str, reqs: list[list], queue: asyncio.Queue, seen: set[str], event_type: str):
    try:
        async with relay_manager.connect(relay) as ws:
            for req in reqs:
                await relay_manager.send(ws, req)

            while True:
                msg = await relay_manager.recv_json(ws)
                if not msg:
                    continue
                if msg[0] == "EOSE":
                    await queue.put({"type": "_eose_part"})
                    continue

                if msg[0] != "EVENT":
                    continue
                
                _, _, ev = msg
                eid = ev.get("id")
                if not eid or eid in seen:
                    continue
                seen.add(eid)
                
                # If it's a DM, try to decrypt it and attach partner info
                if event_type == "dm" and ev.get("kind") == 4:
                    privkey, my_pubkey = _get_keys()
                    direction, partner = _extract_partner(my_pubkey, ev)
                    decrypted_text = _decrypt(privkey, partner, ev.get("content") or "")
                    
                    # Add formatted fields for the frontend
                    ev["content"] = decrypted_text
                    ev["from_me"] = direction == "OUT"
                    ev["partner_pubkey"] = partner

                await queue.put({"type": event_type, "event": ev})
    except asyncio.CancelledError:
        raise
    except Exception:
        return



async def _ws_sender(websocket: WebSocket, queue: asyncio.Queue, expected_eose: int, blocked_set: set[str] | None = None):
    eose_count = 0
    eose_sent = False
    connection_start = int(time.time())
    blocked_set = blocked_set or set()
    
    while True:
        payload = await queue.get()
        
        if payload.get("type") == "_eose_part":
            eose_count += 1
            # Only send final EOSE if we haven't already and we hit the target
            if not eose_sent and eose_count >= expected_eose:
                await websocket.send_json({"type": "eose"})
                eose_sent = True
            continue
        
        # Check backend mute filter for live events
        ev = payload.get("event")
        if ev:
            # Check if this is a "live" event (created after we started listening)
            # We add a small buffer (e.g. -5s) to avoid race conditions but generally "live" means "new".
            # For strictness: created_at > connection_start
            created_at = ev.get("created_at", 0)
            
            # Identify the author to block (sender)
            # For DMs, the sender is ev['pubkey'].
            author = ev.get("pubkey")
            
            if author in blocked_set and created_at > connection_start:
                print(f"[WS] 🚫 Blocking live event from muted user {author[:8]}")
                continue
            
        await websocket.send_json(payload)


async def _ws_keepalive(websocket: WebSocket, interval: float = 20.0):
    while True:
        await asyncio.sleep(interval)
        try:
            await websocket.send_json({"type": "ping"})
        except Exception:
            break


async def _run_ws(websocket: WebSocket, reqs_by_relay: dict[str, list[list]], event_type: str, blocked_set: set[str] | None = None):
    await websocket.accept()
    queue: asyncio.Queue = asyncio.Queue()
    seen: set[str] = set()

    tasks = [
        asyncio.create_task(_relay_stream_task(relay, reqs, queue, seen, event_type))
        for relay, reqs in reqs_by_relay.items()
    ]
    
    expected_eose = sum(len(reqs) for reqs in reqs_by_relay.values())
    sender = asyncio.create_task(_ws_sender(websocket, queue, expected_eose, blocked_set))
    keepalive = asyncio.create_task(_ws_keepalive(websocket))

    try:
        done, pending = await asyncio.wait(
            [sender, keepalive], return_when=asyncio.FIRST_EXCEPTION
        )
        for d in done:
            if d.exception():
                raise d.exception()
    except WebSocketDisconnect:
        pass
    finally:
        for t in tasks:
            t.cancel()
        sender.cancel()
        keepalive.cancel()


@app.get("/feed")
async def get_feed(limit: int | None = None, since_seconds: int | None = None):
    _, my_pubkey = _get_keys()
    follows = await fetch_following_all_relays(my_pubkey)
    authors = list(follows | {my_pubkey})
    events = await fetch_feed_events(authors, since_seconds=since_seconds, limit=limit)
    return {"count": len(events), "events": events}


@app.get("/me")
async def get_me():
    _, my_pubkey = _get_keys()
    profile = await fetch_profile_by_pubkey(my_pubkey)
    return {"pubkey": my_pubkey, "profile": profile}


@app.get("/me/following")
async def get_my_following():
    _, my_pubkey = _get_keys()
    following = await fetch_following_all_relays(my_pubkey)
    return {"following": list(following)}


@app.get("/users/{pubkey}/posts")
async def get_user_posts(pubkey: str, limit: int | None = None):
    try:
        norm_pubkey = normalize_pubkey_input(pubkey)
    except:
        norm_pubkey = pubkey
    events = await fetch_feed_events([norm_pubkey], limit=limit)
    return {"count": len(events), "events": events}


@app.get("/users/{pubkey}/stats")
async def get_user_stats(pubkey: str):
    try:
        norm_pubkey = normalize_pubkey_input(pubkey)
    except:
        norm_pubkey = pubkey

    _, my_pubkey = _get_keys()
        
    # Run following, followers, and MY following (to check relationship) in parallel
    following, followers, my_following = await asyncio.gather(
        fetch_following_all_relays(norm_pubkey),
        fetch_followers_all_relays(norm_pubkey),
        fetch_following_all_relays(my_pubkey)
    )
    
    return {
        "following_count": len(following),
        "followers_count": len(followers),
        "is_following": norm_pubkey in my_following
    }


@app.post("/publish")
async def publish_note(payload: PublishIn):
    content = (payload.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="content cannot be empty")

    privkey, _ = _get_keys()
    eid, ev = build_signed_text_note(privkey, content)
    await publish_to_relays(eid, ev)
    return {"event_id": eid}


@app.post("/react")
async def react_to_post(payload: ReactIn):
    event_id = (payload.event_id or "").strip()
    if not event_id:
        raise HTTPException(status_code=400, detail="event_id cannot be empty")
    
    reaction = (payload.reaction or "+").strip() or "+"
    privkey, my_pubkey = _get_keys()
    
    # Build and publish the reaction event
    eid, ev = build_signed_reaction(
        privkey=privkey,
        target_event_id=event_id,
        target_pubkey=None,  # We don't have the original author's pubkey
        reaction=reaction
    )
    await publish_to_relays(eid, ev)
    return {"event_id": eid}


@app.post("/comment")
async def post_comment(payload: CommentIn):
    event_id = (payload.event_id or "").strip()
    event_pubkey = (payload.event_pubkey or "").strip()
    content = (payload.content or "").strip()
    
    if not event_id:
        raise HTTPException(status_code=400, detail="event_id cannot be empty")
    if not content:
        raise HTTPException(status_code=400, detail="content cannot be empty")
    
    privkey, _ = _get_keys()
    
    # Build the target event dict for build_signed_comment
    target_event = {
        "id": event_id,
        "pubkey": event_pubkey,
        "tags": []  # We don't have the full event, but build_signed_comment will handle it
    }
    
    # Build and publish the comment
    eid, ev = build_signed_comment(
        privkey=privkey,
        target_event=target_event,
        content=content
    )
    await publish_to_relays(eid, ev)
    return {"event_id": eid}


@app.post("/follow")
async def follow_user(payload: FollowIn):
    privkey, my_pubkey = _get_keys()
    try:
        pk = normalize_pubkey_input(payload.pubkey)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    current = await fetch_following_all_relays(my_pubkey)
    updated = apply_follow(current, pk)
    
    # Update cache immediately
    update_following_cache(my_pubkey, updated)
    
    eid, ev = build_signed_contacts_event(privkey, sorted(updated))
    await publish_to_relays(eid, ev)
    return {"following": len(updated)}


@app.post("/unfollow")
async def unfollow_user(payload: FollowIn):
    privkey, my_pubkey = _get_keys()
    try:
        pk = normalize_pubkey_input(payload.pubkey)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    current = await fetch_following_all_relays(my_pubkey)
    updated = apply_unfollow(current, pk)
    
    # Update cache immediately
    update_following_cache(my_pubkey, updated)
    
    eid, ev = build_signed_contacts_event(privkey, sorted(updated))
    await publish_to_relays(eid, ev)
    return {"following": len(updated)}


@app.get("/me/muted")
async def get_my_muted():
    _, my_pubkey = _get_keys()
    muted = await fetch_published_mute_set(my_pubkey)
    return {"muted": list(muted)}


@app.post("/mute")
async def mute_user(payload: FollowIn):
    privkey, my_pubkey = _get_keys()
    try:
        pk = normalize_pubkey_input(payload.pubkey)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    current = await fetch_published_mute_set(my_pubkey)
    if pk not in current:
        current.add(pk)
        
        # Update cache immediately
        update_mute_cache(my_pubkey, current)
        
        eid, ev = await publish_mute_set(privkey, current)
        await publish_to_relays(eid, ev)
    
    return {"muted_count": len(current)}


@app.post("/unmute")
async def unmute_user(payload: FollowIn):
    privkey, my_pubkey = _get_keys()
    try:
        pk = normalize_pubkey_input(payload.pubkey)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    current = await fetch_published_mute_set(my_pubkey)
    if pk in current:
        current.remove(pk)
        
        # Update cache immediately
        update_mute_cache(my_pubkey, current)
        
        eid, ev = await publish_mute_set(privkey, current)
        await publish_to_relays(eid, ev)

    return {"muted_count": len(current)}


@app.get("/search")
async def search_users(q: str | None = None, pubkey: str | None = None):
    if pubkey:
        try:
            prof = await fetch_profile_by_pubkey(pubkey)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        if not prof:
            return {"profile": None}
        return {"profile": prof}

    if not q:
        raise HTTPException(status_code=400, detail="q or pubkey required")

    # Check if q looks like a pubkey (npub or hex)
    q_stripped = q.strip()
    if q_stripped.startswith("npub1") or (len(q_stripped) == 64 and all(c in '0123456789abcdefABCDEF' for c in q_stripped)):
        # It's a pubkey, normalize and fetch profile
        try:
            normalized_pubkey = normalize_pubkey_input(q_stripped)
            prof = await fetch_profile_by_pubkey(normalized_pubkey)
            if not prof:
                return {"profile": None}
            return {"profile": prof}
        except ValueError as e:
            # If normalization fails, fall through to name search
            pass

    # Otherwise, search by name
    results = await search_profiles_by_name(q)
    return {"results": results}


@app.get("/dm/inbox")
async def dm_inbox():
    privkey, my_pubkey = _get_keys()
    blocked_set = await fetch_published_mute_set(my_pubkey)
    inbox = await fetch_dm_inbox_7d(privkey, my_pubkey, blocked_set)
    return {"count": len(inbox), "inbox": inbox}


@app.get("/dm/history")
async def dm_history(partner_pubkey: str):
    privkey, my_pubkey = _get_keys()
    try:
        partner = normalize_pubkey_input(partner_pubkey)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    blocked_set = await fetch_published_mute_set(my_pubkey)
    history = await fetch_dm_history_7d(privkey, my_pubkey, partner, blocked_set)
    return {"count": len(history), "history": history}


@app.post("/dm/send")
async def dm_send(payload: DMMessageIn):
    privkey, _ = _get_keys()
    try:
        partner = normalize_pubkey_input(payload.partner_pubkey)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    msg = (payload.message or "").strip()
    if not msg:
        raise HTTPException(status_code=400, detail="message cannot be empty")

    eid, ev = build_signed_dm(privkey, partner, msg)
    await publish_to_relays(eid, ev, quiet=True)
    return {"event_id": eid}


@app.get("/health")
async def health():
    return {"ok": True}


@app.websocket("/ws/feed")
async def ws_feed(websocket: WebSocket, since: int | None = None, until: int | None = None):
    _, my_pubkey = _get_keys()
    follows = await fetch_following_all_relays(my_pubkey)
    authors = list(follows | {my_pubkey})
    
    # Default to 1 hour ago if not specified
    if since is None:
        now = int(time.time())
        since = now - (60 * 60)
    else:
        since = int(since)

    # Debug logging
    print(f"[FEED] Fetching feed for {len(authors)} authors")
    print(f"[FEED] Time range: {since} ({datetime.fromtimestamp(since)}) to {until if until else 'now'} ({datetime.fromtimestamp(until) if until else 'now'})")
    
    reqs_by_relay: dict[str, list[list]] = {}
    for relay in RELAYS:
        reqs = []
        for author_chunk in _chunk(authors, AUTHOR_CHUNK_SIZE):
            sub_id = relay_manager.new_sub_id()
            
            filter_ = {"authors": author_chunk, "kinds": [1], "since": since}
            if until is not None:
                filter_["until"] = int(until)

            reqs.append(
                relay_manager.make_req(
                    sub_id,
                    filter_,
                )
            )
        reqs_by_relay[relay] = reqs
    
    print(f"[FEED] Sending {sum(len(r) for r in reqs_by_relay.values())} subscription requests across {len(RELAYS)} relays")
    await _run_ws(websocket, reqs_by_relay, event_type="feed")


@app.websocket("/ws/users/{pubkey}")
async def ws_user_feed(websocket: WebSocket, pubkey: str, since: int | None = None, limit: int | None = None):
    # Normalize pubkey if needed
    try:
        norm_pubkey = normalize_pubkey_input(pubkey)
    except:
        norm_pubkey = pubkey

    filter_args = {"authors": [norm_pubkey], "kinds": [1]}
    
    if limit is not None:
        filter_args["limit"] = int(limit)
    
    if since is not None:
        filter_args["since"] = int(since)
    elif limit is None:
        # If no limit and no since, default to "Live" (since Now)
        filter_args["since"] = int(time.time())

    reqs_by_relay: dict[str, list[list]] = {}
    for relay in RELAYS:
        sub_id = relay_manager.new_sub_id()
        reqs_by_relay[relay] = [
            relay_manager.make_req(
                sub_id,
                filter_args,
            )
        ]

    await _run_ws(websocket, reqs_by_relay, event_type="feed")


@app.websocket("/ws/dm")
async def ws_dm(websocket: WebSocket, since: int | None = None, limit: int | None = None, partner_pubkey: str | None = None):
    _, my_pubkey = _get_keys()
    
    # Default to 30 days of DMs if not specified
    if since is None:
        now = int(time.time())
        since = now - (60 * 60 * 24 * 30)
    else:
        since = int(since)

    # Base filters
    filter_recv = {"kinds": [4], "#p": [my_pubkey], "since": since}
    filter_sent = {"kinds": [4], "authors": [my_pubkey], "since": since}
    
    # If specific partner requested, narrow filters
    if partner_pubkey:
        try:
            partner = normalize_pubkey_input(partner_pubkey)
            # Messages sent BY partner TO me
            filter_recv["authors"] = [partner]
            # Messages sent BY me TO partner
            filter_sent["#p"] = [partner]
        except:
            pass
    
    if limit is not None:
        filter_recv["limit"] = int(limit)
        filter_sent["limit"] = int(limit)

    # Fetch mute list to block LIVE events
    blocked_set = await fetch_published_mute_set(my_pubkey)

    reqs_by_relay: dict[str, list[list]] = {}
    for relay in RELAYS:
        sub_id = relay_manager.new_sub_id()
        reqs_by_relay[relay] = [
            relay_manager.make_req(
                sub_id,
                filter_recv,
                filter_sent,
            )
        ]

    await _run_ws(websocket, reqs_by_relay, event_type="dm", blocked_set=blocked_set)


@app.websocket("/ws/notify")
async def ws_notify(websocket: WebSocket):
    _, my_pubkey = _get_keys()
    now = int(time.time())

    reqs_by_relay: dict[str, list[list]] = {}
    for relay in RELAYS:
        sub_id = relay_manager.new_sub_id()
        reqs_by_relay[relay] = [
            relay_manager.make_req(
                sub_id,
                {"kinds": [7, 1], "#p": [my_pubkey], "since": now},
                {"kinds": [3, 30000], "authors": [my_pubkey], "since": now},
            )
        ]

    await _run_ws(websocket, reqs_by_relay, event_type="notify")


@app.websocket("/ws/relationship")
async def ws_relationship(websocket: WebSocket, target_pubkey: str):
    await websocket.accept()
    _, my_pubkey = _get_keys()
    
    try:
        norm_target = normalize_pubkey_input(target_pubkey)
    except:
        norm_target = target_pubkey

    # Subscribe to own contact list (Kind 3) to track changes
    reqs_by_relay: dict[str, list[list]] = {}
    for relay in RELAYS:
        sub_id = relay_manager.new_sub_id()
        reqs_by_relay[relay] = [
            relay_manager.make_req(
                sub_id,
                {"authors": [my_pubkey], "kinds": [3], "limit": 1}
            )
        ]

    queue: asyncio.Queue = asyncio.Queue()
    seen: set[str] = set()
    
    tasks = [
        asyncio.create_task(_relay_stream_task(relay, reqs, queue, seen, "contact_list"))
        for relay, reqs in reqs_by_relay.items()
    ]
    
    # Keep alive task
    keepalive = asyncio.create_task(_ws_keepalive(websocket))

    try:
        while True:
            # Wait for event or connection close
            msg = await queue.get()
            
            if msg.get("type") == "contact_list":
                event = msg.get("event")
                if not event:
                    continue
                    
                # Parse tags to check relationship
                tags = event.get("tags", [])
                is_following = any(len(t) >= 2 and t[0] == "p" and t[1] == norm_target for t in tags)
                
                await websocket.send_json({
                    "type": "relationship",
                    "is_following": is_following,
                    "target_pubkey": norm_target
                })
                
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WS Relationship error: {e}")
    finally:
        for t in tasks:
            t.cancel()
        keepalive.cancel()


@app.websocket("/ws/stats/{pubkey}")
async def ws_stats(websocket: WebSocket, pubkey: str):
    await websocket.accept()
    
    try:
        norm_pubkey = normalize_pubkey_input(pubkey)
    except:
        norm_pubkey = pubkey

    # Subscribe to own contact list (Kind 3) for "Following" count
    # Subscribe to others' contact lists (Kind 3) referencing me for "Followers" count
    reqs_by_relay: dict[str, list[list]] = {}
    
    for relay in RELAYS:
        sub_id = relay_manager.new_sub_id()
        reqs_by_relay[relay] = [
            relay_manager.make_req(
                sub_id,
                # Filter 1: My Following (Kind 3 from me)
                {"authors": [norm_pubkey], "kinds": [3], "limit": 1},
                # Filter 2: My Followers (Kind 3 tagging me)
                # Note: This can be heavy, but we want streams
                {"kinds": [3], "#p": [norm_pubkey]}
            )
        ]

    queue: asyncio.Queue = asyncio.Queue()
    seen: set[str] = set()
    
    tasks = [
        asyncio.create_task(_relay_stream_task(relay, reqs, queue, seen, "stats_event"))
        for relay, reqs in reqs_by_relay.items()
    ]
    
    keepalive = asyncio.create_task(_ws_keepalive(websocket))
    
    known_followers = set()
    following_count = 0
    followers_count = 0
    
    # Send initial zero counts
    await websocket.send_json({
        "type": "stats",
        "following": 0,
        "followers": 0
    })

    try:
        while True:
            msg = await queue.get()
            
            if msg.get("type") == "stats_event":
                event = msg.get("event")
                if not event:
                    continue
                
                # Check if it's the user's own contact list (Following Count)
                if event["pubkey"] == norm_pubkey:
                     # Count 'p' tags
                    tags = event.get("tags", [])
                    new_following = sum(1 for t in tags if len(t) >= 2 and t[0] == "p")
                    if new_following != following_count:
                        following_count = new_following
                        await websocket.send_json({
                            "type": "stats",
                            "following": following_count,
                            "followers": followers_count
                        })
                
                # Check if it's someone else (Follower)
                else:
                    if event["pubkey"] not in known_followers:
                        known_followers.add(event["pubkey"])
                        followers_count = len(known_followers)
                        await websocket.send_json({
                            "type": "stats",
                            "following": following_count,
                            "followers": followers_count
                        })
                
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WS Stats error: {e}")
    finally:
        for t in tasks:
            t.cancel()
        keepalive.cancel()
