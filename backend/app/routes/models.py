import asyncio
import time

from fastapi import APIRouter

from app.config import settings
from app.providers.ollama import OllamaProvider
from app.providers.openai_compat import OpenAICompatProvider
from app.schemas import CloudModel, JudgeInfo, LocalModel, ModelsResponse

router = APIRouter(prefix="/api", tags=["models"])

_cached_cloud: list[CloudModel] = []
_last_fetch = 0.0


async def _fetch_cloud() -> list[CloudModel]:
    global _cached_cloud, _last_fetch
    now = time.time()
    if _cached_cloud and (now - _last_fetch < 60.0):
        return _cached_cloud

    items: list[CloudModel] = []

    async def _get_groq() -> list[CloudModel]:
        if not settings.groq_api_key.strip():
            return []
        try:
            groq = OpenAICompatProvider(
                "https://api.groq.com/openai/v1", settings.groq_api_key, "groq"
            )
            mods = await groq.list_models()
            return [
                CloudModel(provider="groq", name=m.name)
                for m in mods
                if "whisper" not in m.name
            ]
        except Exception:
            return []

    async def _get_openrouter() -> list[CloudModel]:
        if not settings.openrouter_api_key.strip():
            return []
        try:
            op = OpenAICompatProvider(
                "https://openrouter.ai/api/v1",
                settings.openrouter_api_key,
                "openrouter",
            )
            mods = await op.list_models()
            return [
                CloudModel(provider="openrouter", name=m.name)
                for m in mods
            ]
        except Exception:
            return []

    res = await asyncio.gather(_get_groq(), _get_openrouter(), return_exceptions=True)
    for r in res:
        if isinstance(r, list):
            items.extend(r)

    if items:
        _cached_cloud = items
        _last_fetch = now

    return items


@router.get("/models", response_model=ModelsResponse)
async def get_models() -> ModelsResponse:
    ollama = OllamaProvider(settings.ollama_host)
    local_models: list[LocalModel] = []
    judge_available = False

    try:
        models = await ollama.list_models()
        for m in models:
            is_judge = (
                m.name == settings.judge_model
                or m.name == f"{settings.judge_model}:latest"
                or (
                    settings.judge_model.endswith(":latest")
                    and m.name == settings.judge_model[:-7]
                )
            )
            if is_judge:
                judge_available = True
            else:
                local_models.append(LocalModel(name=m.name, size_gb=m.size_gb))
    except Exception:
        pass

    cloud_models = await _fetch_cloud()

    judge_info = JudgeInfo(
        provider=settings.judge_provider,
        model=settings.judge_model,
        available=judge_available,
        host=settings.ollama_host,
    )

    return ModelsResponse(
        local=local_models, cloud=cloud_models, judge=judge_info
    )
