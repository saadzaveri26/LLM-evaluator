import asyncio
from collections.abc import AsyncIterator


class EventBus:
    def __init__(self) -> None:
        self.history: dict[str, list[dict]] = {}
        self.subs: dict[str, list[asyncio.Queue]] = {}

    def publish(self, run_id: str, name: str, data: dict) -> None:
        evt = {"event": name, "data": data}
        if run_id not in self.history:
            self.history[run_id] = []
        self.history[run_id].append(evt)
        for q in self.subs.get(run_id, []):
            q.put_nowait(evt)

    async def subscribe(self, run_id: str) -> AsyncIterator[dict]:
        q: asyncio.Queue = asyncio.Queue()
        if run_id not in self.subs:
            self.subs[run_id] = []
        self.subs[run_id].append(q)

        try:
            for evt in self.history.get(run_id, []):
                yield evt
                if evt.get("event") in ("done", "error", "cancelled"):
                    return

            while True:
                evt = await q.get()
                yield evt
                if evt.get("event") in ("done", "error", "cancelled"):
                    break
        finally:
            if run_id in self.subs and q in self.subs[run_id]:
                self.subs[run_id].remove(q)


bus = EventBus()
