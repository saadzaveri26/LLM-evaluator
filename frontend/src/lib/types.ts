export interface LocalModel {
  name: string;
  size_gb: number;
}

export interface CloudModel {
  provider: string;
  name: string;
}

export interface JudgeInfo {
  provider: string;
  model: string;
  available: boolean;
}

export interface ModelsResponse {
  local: LocalModel[];
  cloud: CloudModel[];
  judge: JudgeInfo;
}

export interface PromptItem {
  text: string;
  reference?: string | null;
}

export interface CloudSelection {
  provider: string;
  model: string;
}

export interface RunCreateRequest {
  prompts: PromptItem[];
  models: string[];
  cloud: CloudSelection[];
  passes: number;
  temperature: number;
}

export interface RunCreateResponse {
  id: string;
}

export interface RunListItem {
  id: string;
  created_at: string;
  status: string;
  models: string[];
  prompt_count: number;
  first_prompt?: string;
}

export interface RunModelItem {
  name: string;
  provider: string;
  size_gb: number;
  vram_gb: number;
  local: boolean;
}

export interface ResponseItem {
  id: number;
  prompt_id: number;
  model: string;
  provider?: string;
  text: string;
  ttft_ms: number;
  total_ms: number;
  tps: number;
  out_tokens: number;
  error?: string | null;
}

export interface ScoreItem {
  id?: number;
  response_id: number;
  pass: number;
  overall: number | null;
  correctness: number | null;
  completeness: number | null;
  clarity: number | null;
  instruction_following: number | null;
  rationale: string;
}

export interface SummaryItem {
  model: string;
  provider?: string;
  quality: number;
  quality_ci: [number, number];
  tps: number;
  ttft_ms: number;
  total_ms?: number;
  mem_gb: number;
  errors: number;
  failed?: boolean;
}

export interface RetestAudit {
  rho: number;
  mad: number;
  n: number;
}

export interface LengthAudit {
  r: number;
  n: number;
  flag: boolean;
}

export interface OrderAudit {
  consistency: number;
  pairs: number;
  a_win_rate: number;
}

export interface AuditObject {
  trust: number;
  label: string;
  retest: RetestAudit;
  length: LengthAudit;
  order: OrderAudit;
  cross: unknown | null;
  self_judged: boolean;
  notes: string[];
  retest_pairs?: { p1: number; p2: number }[];
  length_points?: { words: number; score: number; model: string }[];
}

export interface RunDetail {
  id: string;
  status: string;
  phase: string;
  created_at: string;
  config: RunCreateRequest;
  models: RunModelItem[];
  responses: ResponseItem[];
  scores: ScoreItem[];
  summary: SummaryItem[];
  audit: AuditObject | null;
}

export interface BestModel {
  model: string;
  reason: string;
}

export interface GoodEnoughModel {
  model: string;
  reason: string;
  threshold: number;
}

export interface RankingItem {
  model: string;
  score: number;
  quality: number;
  tps: number;
  mem_gb: number;
}

export interface RecommendationResponse {
  best: BestModel;
  good_enough: GoodEnoughModel;
  ranking: RankingItem[];
  frontier: string[];
  axis: string;
}
