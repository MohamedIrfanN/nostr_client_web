import asyncio
import time
from .config import RELAYS, PUBLISH_TIMEOUT
from .relay_manager import RelayManager


relay_manager = RelayManager()


async def publish_to_relay(relay_url: str, event_id: str, event: dict, quiet: bool = False) -> bool:
    try:
        async with relay_manager.connect(relay_url) as ws:
            await relay_manager.send(ws, ["EVENT", event])
            start = time.time()
            while True:
                remaining = PUBLISH_TIMEOUT - (time.time() - start)
                if remaining <= 0:
                    if not quiet:
                        print(f"{relay_url}: publish timeout")
                    return False
                msg = await relay_manager.recv_json(ws, timeout=remaining)
                if msg[0] == "OK" and msg[1] == event_id:
                    if not quiet:
                        print(f"{relay_url}: {msg[2]} {msg[3]}")
                    return bool(msg[2])
    except Exception as e:
        if not quiet:
            print(f"{relay_url}: publish error {e}")
        return False


async def publish_to_relays(event_id: str, event: dict, quiet: bool = False):
    results = await asyncio.gather(
        *(publish_to_relay(r, event_id, event, quiet=quiet) for r in RELAYS)
    )
    if not quiet:
        print(f"Published to {sum(results)}/{len(RELAYS)} relays")
