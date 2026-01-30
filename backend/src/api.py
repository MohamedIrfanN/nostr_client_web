import asyncio
import time

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .nostr_client.utils import get_privkey_from_env, pubkey_xonly_hex, normalize_pubkey_input
from .nostr_client.config import RELAYS, AUTHOR_CHUNK_SIZE
from .nostr_client.events import (
    build_signed_text_note,
    build_signed_contacts_event,
    build_signed_dm,
)
from .nostr_client.publish import publish_to_relays
from .nostr_client.contacts import fetch_following_all_relays, apply_follow, apply_unfollow
from .nostr_client.profile_search import fetch_profile_by_pubkey, search_profiles_by_name
from .nostr_client.dm_subscribe import fetch_dm_inbox_7d, fetch_dm_history_7d
from .nostr_client.mute_list import fetch_published_mute_set
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


class PublishIn(BaseModel):
    content: str


class FollowIn(BaseModel):
    pubkey: str


class DMMessageIn(BaseModel):
    partner_pubkey: str
    message: str


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
                if msg[0] != "EVENT":
                    continue

                _, _, ev = msg
                eid = ev.get("id")
                if not eid or eid in seen:
                    continue
                seen.add(eid)
                await queue.put({"type": event_type, "event": ev})
    except asyncio.CancelledError:
        raise
    except Exception:
        return


async def _ws_sender(websocket: WebSocket, queue: asyncio.Queue):
    while True:
        payload = await queue.get()
        await websocket.send_json(payload)


async def _ws_keepalive(websocket: WebSocket, interval: float = 20.0):
    while True:
        await asyncio.sleep(interval)
        await websocket.send_json({"type": "ping"})


async def _run_ws(websocket: WebSocket, reqs_by_relay: dict[str, list[list]], event_type: str):
    await websocket.accept()
    queue: asyncio.Queue = asyncio.Queue()
    seen: set[str] = set()

    tasks = [
        asyncio.create_task(_relay_stream_task(relay, reqs, queue, seen, event_type))
        for relay, reqs in reqs_by_relay.items()
    ]
    sender = asyncio.create_task(_ws_sender(websocket, queue))
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


@app.post("/publish")
async def publish_note(payload: PublishIn):
    content = (payload.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="content cannot be empty")

    privkey, _ = _get_keys()
    eid, ev = build_signed_text_note(privkey, content)
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
    eid, ev = build_signed_contacts_event(privkey, sorted(updated))
    await publish_to_relays(eid, ev)
    return {"following": len(updated)}


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
async def ws_feed(websocket: WebSocket):
    _, my_pubkey = _get_keys()
    follows = await fetch_following_all_relays(my_pubkey)
    authors = list(follows | {my_pubkey})
    now = int(time.time())

    reqs_by_relay: dict[str, list[list]] = {}
    for relay in RELAYS:
        reqs = []
        for author_chunk in _chunk(authors, AUTHOR_CHUNK_SIZE):
            sub_id = relay_manager.new_sub_id()
            reqs.append(
                relay_manager.make_req(
                    sub_id,
                    {"authors": author_chunk, "kinds": [1], "since": now},
                )
            )
        reqs_by_relay[relay] = reqs

    await _run_ws(websocket, reqs_by_relay, event_type="feed")


@app.websocket("/ws/dm")
async def ws_dm(websocket: WebSocket):
    _, my_pubkey = _get_keys()
    now = int(time.time())

    reqs_by_relay: dict[str, list[list]] = {}
    for relay in RELAYS:
        sub_id = relay_manager.new_sub_id()
        reqs_by_relay[relay] = [
            relay_manager.make_req(
                sub_id,
                {"kinds": [4], "#p": [my_pubkey], "since": now},
                {"kinds": [4], "authors": [my_pubkey], "since": now},
            )
        ]

    await _run_ws(websocket, reqs_by_relay, event_type="dm")


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
