from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Protocol


@dataclass
class Chunk:
    text: str
    done: bool
    stats: dict | None = None


@dataclass
class ModelInfo:
    name: str
    size_gb: float = 0.0
    provider: str = "ollama"


class Provider(Protocol):
    async def stream(
        self, model: str, messages: list[dict], opts: dict
    ) -> AsyncIterator[Chunk]: ...

    async def list_models(self) -> list[ModelInfo]: ...

    async def unload(self, model: str) -> None: ...
