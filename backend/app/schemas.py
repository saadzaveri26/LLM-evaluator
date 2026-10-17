from typing import Any

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    ok: bool = True


class LocalModel(BaseModel):
    name: str
    size_gb: float = 0.0


class CloudModel(BaseModel):
    provider: str
    name: str


class JudgeInfo(BaseModel):
    provider: str
    model: str
    available: bool


class ModelsResponse(BaseModel):
    local: list[LocalModel]
    cloud: list[CloudModel]
    judge: JudgeInfo


class PromptItem(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    reference: str | None = None


class CloudSelection(BaseModel):
    provider: str
    model: str


class RunCreateRequest(BaseModel):
    prompts: list[PromptItem] = Field(min_length=1, max_length=20)
    models: list[str] = Field(default_factory=list)
    cloud: list[CloudSelection] = Field(default_factory=list)
    passes: int = Field(default=1, ge=1, le=2)
    temperature: float = Field(default=0.2, ge=0.0, le=2.0)


class RunCreateResponse(BaseModel):
    id: str


class RunListItem(BaseModel):
    id: str
    created_at: str
    status: str
    models: list[str]
    prompt_count: int
    first_prompt: str = ""


class RunModelItem(BaseModel):
    name: str
    provider: str
    size_gb: float = 0.0
    vram_gb: float = 0.0
    local: bool = True


class ResponseItem(BaseModel):
    id: int
    prompt_id: int
    model: str
    text: str
    ttft_ms: float = 0.0
    total_ms: float = 0.0
    tps: float = 0.0
    out_tokens: int = 0
    error: str | None = None


class ScoreItem(BaseModel):
    response_id: int
    pass_num: int = Field(alias="pass", default=1)
    overall: int = 0
    correctness: int = 0
    completeness: int = 0
    clarity: int = 0
    instruction_following: int = 0
    rationale: str = ""

    model_config = {"populate_by_name": True}


class SummaryItem(BaseModel):
    model: str
    quality: float = 0.0
    quality_ci: list[float] = Field(default_factory=lambda: [0.0, 0.0])
    tps: float = 0.0
    ttft_ms: float = 0.0
    mem_gb: float = 0.0
    errors: int = 0


class RetestAudit(BaseModel):
    rho: float = 0.0
    mad: float = 0.0
    n: int = 0


class LengthAudit(BaseModel):
    r: float = 0.0
    n: int = 0
    flag: bool = False


class OrderAudit(BaseModel):
    consistency: float = 0.0
    pairs: int = 0
    a_win_rate: float = 0.0


class AuditObject(BaseModel):
    trust: int = 0
    label: str = ""
    retest: RetestAudit = Field(default_factory=RetestAudit)
    length: LengthAudit = Field(default_factory=LengthAudit)
    order: OrderAudit = Field(default_factory=OrderAudit)
    cross: Any = None
    self_judged: bool = False
    notes: list[str] = Field(default_factory=list)


class RunDetail(BaseModel):
    id: str
    status: str
    phase: str
    created_at: str
    config: dict[str, Any] = Field(default_factory=dict)
    models: list[RunModelItem] = Field(default_factory=list)
    responses: list[ResponseItem] = Field(default_factory=list)
    scores: list[ScoreItem] = Field(default_factory=list)
    summary: list[SummaryItem] = Field(default_factory=list)
    audit: AuditObject | None = None


class BestModel(BaseModel):
    model: str
    reason: str


class GoodEnoughModel(BaseModel):
    model: str
    reason: str
    threshold: float = 0.9


class RankingItem(BaseModel):
    model: str
    score: float = 0.0
    quality: float = 0.0
    tps: float = 0.0
    mem_gb: float = 0.0


class RecommendationResponse(BaseModel):
    best: BestModel
    good_enough: GoodEnoughModel
    ranking: list[RankingItem]
    frontier: list[str]
    axis: str = "memory"
