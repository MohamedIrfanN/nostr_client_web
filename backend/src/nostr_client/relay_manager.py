import asyncio
import json
import uuid
from contextlib import asynccontextmanager

import websockets

from .config import RELAYS, PING_INTERVAL, PING_TIMEOUT


class RelayManager:
    def __init__(
        self,
        relays: list[str] | None = None,
        ping_interval: int = PING_INTERVAL,
        ping_timeout: int = PING_TIMEOUT,
    ):
        self.relays = relays or RELAYS
        self.ping_interval = ping_interval
        self.ping_timeout = ping_timeout

    def new_sub_id(self) -> str:
        return str(uuid.uuid4())

    def make_req(self, sub_id: str, *filters: dict) -> list:
        return ["REQ", sub_id, *filters]

    def dumps(self, msg: list | dict) -> str:
        return json.dumps(msg, separators=(",", ":"))

    async def send(self, ws, msg: list | dict) -> None:
        await ws.send(self.dumps(msg))

    async def recv_json(self, ws, timeout: float | None = None) -> list:
        if timeout is None:
            raw = await ws.recv()
        else:
            raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
        return json.loads(raw)

    @asynccontextmanager
    async def connect(
        self,
        relay_url: str,
        ping_interval: int | None = None,
        ping_timeout: int | None = None,
    ):
        pi = self.ping_interval if ping_interval is None else ping_interval
        pt = self.ping_timeout if ping_timeout is None else ping_timeout
        async with websockets.connect(
            relay_url,
            ping_interval=pi,
            ping_timeout=pt,
        ) as ws:
            yield ws

    async def connect_with_timeout(
        self,
        relay_url: str,
        timeout_sec: float,
        ping_interval: int | None = None,
        ping_timeout: int | None = None,
    ):
        pi = self.ping_interval if ping_interval is None else ping_interval
        pt = self.ping_timeout if ping_timeout is None else ping_timeout
        return await asyncio.wait_for(
            websockets.connect(
                relay_url,
                ping_interval=pi,
                ping_timeout=pt,
            ),
            timeout=timeout_sec,
        )
