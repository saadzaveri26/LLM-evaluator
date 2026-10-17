from collections.abc import AsyncIterator
import json
import httpx
from app.providers.base import Chunk, ModelInfo


class OpenAICompatProvider:
    def __init__(self, base_url: str, api_key: str, name: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.name = name
        self.timeout = httpx.Timeout(300.0, connect=5.0)

    async def stream(
        self, model: str, messages: list[dict], opts: dict
    ) -> AsyncIterator[Chunk]:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload: dict = {
            "model": model,
            "messages": messages,
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        if "temperature" in opts and opts["temperature"] is not None:
            payload["temperature"] = opts["temperature"]
        if "seed" in opts and opts["seed"] is not None:
            payload["seed"] = opts["seed"]

        total_text = ""
        usage = None
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/chat/completions",
                headers=headers,
                json=payload,
            ) as res:
                res.raise_for_status()
                async for line in res.aiter_lines():
                    if not line.strip():
                        continue
                    if line.startswith("data: "):
                        data_str = line[6:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            item = json.loads(data_str)
                        except Exception:
                            continue
                        if "usage" in item and item["usage"]:
                            usage = item["usage"]
                        choices = item.get("choices", [])
                        if choices:
                            delta = choices[0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                total_text += content
                                yield Chunk(text=content, done=False)

        out_toks = (
            usage.get("completion_tokens", max(1, len(total_text) // 4))
            if usage
            else max(1, len(total_text) // 4)
        )
        prompt_toks = usage.get("prompt_tokens", 0) if usage else 0
        stats = {
            "out_tokens": out_toks,
            "prompt_tokens": prompt_toks,
            "load_ms": 0.0,
            "eval_ms": 0.0,
            "tps": 0.0,
        }
        yield Chunk(text="", done=True, stats=stats)

    async def list_models(self) -> list[ModelInfo]:
        headers = {"Authorization": f"Bearer {self.api_key}"}
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            res = await client.get(f"{self.base_url}/models", headers=headers)
            res.raise_for_status()
            data = res.json()
            rows = data.get("data", [])
            return [
                ModelInfo(
                    name=m.get("id", ""), size_gb=0.0, provider=self.name
                )
                for m in rows
            ]

    async def unload(self, model: str) -> None:
        pass
