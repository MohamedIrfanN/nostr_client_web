import asyncio
import time
from typing import Iterable

from .config import RELAYS, READ_SINCE_SECONDS, READ_LIMIT, AUTHOR_CHUNK_SIZE
from .relay_manager import RelayManager


relay_manager = RelayManager()
FEED_RECV_TIMEOUT = 5.0


def _chunk(lst: list[str], size: int):
    for i in range(0, len(lst), size):
        yield lst[i : i + size]


async def _fetch_from_relay(relay: str, authors: list[str], since_ts: int, limit: int):
    sub_id = relay_manager.new_sub_id()
    req = relay_manager.make_req(
        sub_id,
        {
            "authors": authors,
            "kinds": [1],
            "since": since_ts,
            "limit": limit,
        },
    )

    events: list[dict] = []
    try:
        async with relay_manager.connect(relay) as ws:
            await relay_manager.send(ws, req)

            start = time.time()
            while True:
                if time.time() - start > FEED_RECV_TIMEOUT:
                    break
                try:
                    msg = await relay_manager.recv_json(ws, timeout=FEED_RECV_TIMEOUT)
                except asyncio.TimeoutError:
                    break

                if not msg:
                    continue

                if msg[0] == "EVENT":
                    _, got_sub, ev = msg
                    if got_sub == sub_id:
                        events.append(ev)
                elif msg[0] == "EOSE":
                    _, got_sub = msg
                    if got_sub == sub_id:
                        break
    except Exception:
        return []

    return events


async def fetch_feed_events(
    authors: Iterable[str],
    since_seconds: int | None = None,
    limit: int | None = None,
) -> list[dict]:
    author_list = [a for a in authors if a]
    if not author_list:
        return []

    since_seconds = READ_SINCE_SECONDS if since_seconds is None else int(since_seconds)
    limit = READ_LIMIT if limit is None else int(limit)
    since_ts = int(time.time()) - max(0, since_seconds)

    tasks = []
    for relay in RELAYS:
        for author_chunk in _chunk(author_list, AUTHOR_CHUNK_SIZE):
            tasks.append(_fetch_from_relay(relay, author_chunk, since_ts, limit))

    results = await asyncio.gather(*tasks)
    seen: set[str] = set()
    out: list[dict] = []

    for batch in results:
        for ev in batch:
            eid = ev.get("id")
            if not eid or eid in seen:
                continue
            seen.add(eid)
            out.append(ev)

    out.sort(key=lambda e: int(e.get("created_at", 0)), reverse=True)
    return out[:limit]
