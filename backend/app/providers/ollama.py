from collections.abc import AsyncIterator
import json
import httpx
from app.providers.base import Chunk, ModelInfo


class OllamaProvider:
    def __init__(self, host: str = "http://localhost:11434") -> None:
        self.host = host
        self.timeout = httpx.Timeout(300.0, connect=5.0)

    async def stream(
        self, model: str, messages: list[dict], opts: dict
    ) -> AsyncIterator[Chunk]:
        payload: dict = {
            "model": model,
            "messages": messages,
            "stream": True,
        }
        options = {
            k: opts[k]
            for k in ("temperature", "seed", "num_ctx")
            if k in opts and opts[k] is not None
        }
        if options:
            payload["options"] = options
        if "format" in opts and opts["format"] is not None:
            payload["format"] = opts["format"]
        if "keep_alive" in opts and opts["keep_alive"] is not None:
            payload["keep_alive"] = opts["keep_alive"]

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            async with client.stream(
                "POST", f"{self.host}/api/chat", json=payload
            ) as res:
                res.raise_for_status()
                async for line in res.aiter_lines():
                    if not line.strip():
                        continue
                    item = json.loads(line)
                    content = item.get("message", {}).get("content", "")
                    done = item.get("done", False)
                    if done:
                        ec = item.get("eval_count", 0)
                        ed = item.get("eval_duration", 0)
                        ld = item.get("load_duration", 0)
                        pc = item.get("prompt_eval_count", 0)
                        tps = (ec / (ed / 1e9)) if ed > 0 else 0.0
                        stats = {
                            "out_tokens": ec,
                            "prompt_tokens": pc,
                            "load_ms": ld / 1e6,
                            "eval_ms": ed / 1e6,
                            "tps": tps,
                        }
                        yield Chunk(text=content, done=True, stats=stats)
                    else:
                        yield Chunk(text=content, done=False)

    async def list_models(self) -> list[ModelInfo]:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            res = await client.get(f"{self.host}/api/tags")
            res.raise_for_status()
            data = res.json()
            rows = data.get("models", [])
            return [
                ModelInfo(
                    name=m.get("name", ""),
                    size_gb=round(m.get("size", 0) / 1e9, 2),
                    provider="ollama",
                )
                for m in rows
            ]

    async def unload(self, model: str) -> None:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                await client.post(
                    f"{self.host}/api/generate",
                    json={"model": model, "keep_alive": 0},
                )
            except Exception:
                pass

    async def ps(self) -> list[dict]:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                res = await client.get(f"{self.host}/api/ps")
                res.raise_for_status()
                data = res.json()
                return [
                    {
                        "model": m.get("model", m.get("name", "")),
                        "size_gb": round(m.get("size", 0) / 1e9, 2),
                        "vram_gb": round(m.get("size_vram", 0) / 1e9, 2),
                    }
                    for m in data.get("models", [])
                ]
            except Exception:
                return []
