from fastapi import APIRouter

from app.config import settings
from app.providers.ollama import OllamaProvider
from app.providers.openai_compat import OpenAICompatProvider
from app.schemas import CloudModel, JudgeInfo, LocalModel, ModelsResponse

router = APIRouter(prefix="/api", tags=["models"])


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

    cloud_models: list[CloudModel] = []
    if settings.groq_api_key.strip():
        try:
            groq = OpenAICompatProvider(
                "https://api.groq.com/openai/v1", settings.groq_api_key, "groq"
            )
            mods = await groq.list_models()
            for m in mods:
                cloud_models.append(CloudModel(provider="groq", name=m.name))
        except Exception:
            pass

    if settings.openrouter_api_key.strip():
        try:
            op = OpenAICompatProvider(
                "https://openrouter.ai/api/v1",
                settings.openrouter_api_key,
                "openrouter",
            )
            mods = await op.list_models()
            for m in mods:
                cloud_models.append(
                    CloudModel(provider="openrouter", name=m.name)
                )
        except Exception:
            pass

    judge_info = JudgeInfo(
        provider=settings.judge_provider,
        model=settings.judge_model,
        available=judge_available,
    )

    return ModelsResponse(
        local=local_models, cloud=cloud_models, judge=judge_info
    )
