import asyncio
import json
from typing import AsyncIterator, Optional


class SlaBroadcaster:
    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue] = set()
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """À appeler une seule fois, au démarrage de l'app (voir lifespan
        dans main.py), pour capturer la boucle asyncio de FastAPI."""
        self._loop = loop

    def subscribe(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=50)
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        self._subscribers.discard(queue)

    def publish(self, event: dict) -> None:
        """Thread-safe : peut être appelée depuis le thread du job
        APScheduler ou depuis une coroutine, sans distinction."""
        if self._loop is None:
            return
        payload = json.dumps(event)
        for queue in list(self._subscribers):
            self._loop.call_soon_threadsafe(self._put_nowait_safe, queue, payload)

    @staticmethod
    def _put_nowait_safe(queue: asyncio.Queue, payload: str) -> None:
        try:
            queue.put_nowait(payload)
        except asyncio.QueueFull:
            pass

    async def stream(self) -> AsyncIterator[str]:
        queue = self.subscribe()
        try:
            while True:
                payload = await queue.get()
                yield f"data: {payload}\n\n"
        finally:
            self.unsubscribe(queue)


broadcaster = SlaBroadcaster()