import asyncio
import time
from typing import Iterable

from .config import RELAYS
from .utils import require_32byte_hex
from .events import build_signed_mute_list
from .relay_manager import RelayManager


RECV_TIMEOUT = 3.0  # prevents "stuck"

relay_manager = RelayManager()

def _extract_mute_pubkeys(event: dict) -> set[str]:
    """
    kind:30000 list, tags include:
      ["d","mute"]
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

    async def _from_relay(relay: str):
        sub_id = relay_manager.new_sub_id()
        req = relay_manager.make_req(
            sub_id,
            {"kinds": [30000], "authors": [my_pubkey], "#d": ["mute"], "limit": 5},
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
    return _extract_mute_pubkeys(newest)


async def publish_mute_set(privkey, blocked_set: Iterable[str]):
    """
    Publish updated mute list (kind:30000, d='mute') to all relays.
    """
    clean = sorted({require_32byte_hex(pk, "blocked pubkey") for pk in blocked_set})
    eid, ev = build_signed_mute_list(privkey, clean)
    return eid, ev
