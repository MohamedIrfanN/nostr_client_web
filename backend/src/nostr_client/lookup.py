import asyncio

from .config import RELAYS
from .relay_manager import RelayManager


relay_manager = RelayManager()


async def fetch_event_by_id_from_relay(relay_url: str, event_id: str, timeout_sec: int = 5) -> dict | None:
    sub_id = relay_manager.new_sub_id()
    req = relay_manager.make_req(sub_id, {"ids": [event_id], "limit": 1})

    try:
        async with relay_manager.connect(relay_url) as ws:
            await relay_manager.send(ws, req)

            while True:
                msg = await relay_manager.recv_json(ws, timeout=timeout_sec)

                if not msg:
                    continue

                if msg[0] == "EVENT":
                    _, got_sub, ev = msg
                    if got_sub == sub_id:
                        return ev

                if msg[0] == "EOSE":
                    _, got_sub = msg
                    if got_sub == sub_id:
                        return None

    except Exception:
        return None


async def fetch_event_by_id_all_relays(event_id: str) -> dict | None:
    results = await asyncio.gather(*(fetch_event_by_id_from_relay(r, event_id) for r in RELAYS))
    for ev in results:
        if ev:
            return ev
    return None
