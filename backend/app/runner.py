from app.events import bus


async def start_run_task(run_id: str) -> None:
    bus.publish(run_id, "phase", {"phase": "queued"})
    bus.publish(run_id, "phase", {"phase": "done"})
    bus.publish(run_id, "done", {})
