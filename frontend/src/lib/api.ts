import {
  ModelsResponse,
  RecommendationResponse,
  RunCreateRequest,
  RunCreateResponse,
  RunDetail,
  RunListItem,
} from "./types";

const BASE_URL =
  process.env.NEXT_PUBLIC_API?.replace(/\/$/, "") || "http://localhost:8000/api";

export async function getHealth(): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE_URL}/health`);
  if (!res.ok) throw new Error("Health check failed");
  return res.json();
}

export async function getModels(): Promise<ModelsResponse> {
  const res = await fetch(`${BASE_URL}/models`);
  if (!res.ok) throw new Error("Failed to load models");
  return res.json();
}

export async function listRuns(): Promise<RunListItem[]> {
  const res = await fetch(`${BASE_URL}/runs`);
  if (!res.ok) throw new Error("Failed to load runs");
  return res.json();
}

export async function getRun(id: string): Promise<RunDetail> {
  const res = await fetch(`${BASE_URL}/runs/${id}`);
  if (!res.ok) throw new Error("Failed to load run");
  return res.json();
}

export async function createRun(
  payload: RunCreateRequest
): Promise<RunCreateResponse> {
  const res = await fetch(`${BASE_URL}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to create run");
  }
  return res.json();
}

export async function cancelRun(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE_URL}/runs/${id}/cancel`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to cancel run");
  return res.json();
}

export async function getRecommendation(
  id: string,
  params: {
    quality?: number;
    speed?: number;
    memory?: number;
    axis?: string;
    threshold?: number;
  } = {}
): Promise<RecommendationResponse | null> {
  const query = new URLSearchParams();
  if (params.quality !== undefined) query.set("quality", String(params.quality));
  if (params.speed !== undefined) query.set("speed", String(params.speed));
  if (params.memory !== undefined) query.set("memory", String(params.memory));
  if (params.axis !== undefined) query.set("axis", params.axis);
  if (params.threshold !== undefined)
    query.set("threshold", String(params.threshold));

  const res = await fetch(`${BASE_URL}/runs/${id}/recommendation?${query}`);
  if (res.status === 409) return null;
  if (!res.ok) throw new Error("Failed to load recommendation");
  return res.json();
}
