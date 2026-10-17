"use client";

import { Suspense, use, useEffect, useState } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Cell,
} from "recharts";
import { Sidebar } from "../../../components/Sidebar";
import { cancelRun, getRecommendation } from "../../../lib/api";
import { RecommendationResponse } from "../../../lib/types";
import { useRun } from "../../../lib/useRun";

export default function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen bg-[#EEF1F4]">
          <aside className="w-full md:w-60 md:min-w-[240px] md:h-screen border-r border-[#C9D0DB] bg-[#F7F9FB] flex flex-col shrink-0" />
          <main className="flex-1 p-6 flex flex-col justify-center items-center">
            <div className="text-xs text-[#5C677D]">Loading benchmark run...</div>
          </main>
        </div>
      }
    >
      <RunContent params={params} />
    </Suspense>
  );
}

function RunContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { run, loading, error } = useRun(id);

  const [activeTab, setActiveTab] = useState<"responses" | "audit">("responses");
  const [axis, setAxis] = useState<"memory" | "latency">("memory");
  const [threshold, setThreshold] = useState<number>(0.9);
  const [qualityW, setQualityW] = useState<number>(5);
  const [speedW, setSpeedW] = useState<number>(5);
  const [memoryW, setMemoryW] = useState<number>(5);
  const [rec, setRec] = useState<RecommendationResponse | null>(null);
  const [selectedPromptIdx, setSelectedPromptIdx] = useState<number>(0);
  const [blindMode, setBlindMode] = useState<boolean>(false);

  useEffect(() => {
    if (!run || run.status !== "done") return;
    const timer = setTimeout(() => {
      getRecommendation(id, {
        quality: qualityW,
        speed: speedW,
        memory: memoryW,
        axis,
        threshold,
      })
        .then(setRec)
        .catch(() => {});
    }, 200);
    return () => clearTimeout(timer);
  }, [id, run?.status, qualityW, speedW, memoryW, axis, threshold]);

  const handleStopRun = async () => {
    try {
      await cancelRun(id);
    } catch {}
  };

  const handleDownloadReport = () => {
    if (!run) return;
    const lines: string[] = [];
    lines.push(`# ModelFit Benchmark Report — Run #${run.id}`);
    lines.push(`Date: ${run.created_at}`);
    lines.push(`Status: ${run.status}\n`);

    if (rec) {
      lines.push(`## Recommendation`);
      lines.push(`- **Good enough model:** ${rec.good_enough.model}`);
      lines.push(`  ${rec.good_enough.reason}`);
      lines.push(`- **Best overall model:** ${rec.best.model}`);
      lines.push(`  ${rec.best.reason}\n`);

      lines.push(`## Ranking Table`);
      lines.push(`| Model | Score | Quality | TPS | Memory (GB) |`);
      lines.push(`|---|---|---|---|---|`);
      for (const r of rec.ranking) {
        lines.push(
          `| ${r.model} | ${r.score} | ${r.quality} | ${r.tps} | ${r.mem_gb} |`
        );
      }
      lines.push("");
    }

    if (run.audit) {
      lines.push(`## Judge Reliability Audit`);
      lines.push(`- Trust score: **${run.audit.trust}/100** (${run.audit.label})`);
      lines.push(`- Retest rho: ${run.audit.retest.rho} (MAD: ${run.audit.retest.mad})`);
      lines.push(`- Length bias r: ${run.audit.length.r} (Flagged: ${run.audit.length.flag})`);
      lines.push(`- Order consistency: ${run.audit.order.consistency} (A win rate: ${run.audit.order.a_win_rate})`);
      lines.push("");
      if (run.audit.notes.length > 0) {
        lines.push(`### Audit Notes`);
        for (const n of run.audit.notes) {
          lines.push(`- ${n}`);
        }
        lines.push("");
      }
    }

    lines.push(`## Evaluated Prompts`);
    run.config.prompts.forEach((p, i) => {
      lines.push(`### Prompt ${i + 1}`);
      lines.push(p.text);
      if (p.reference) lines.push(`*Reference:* ${p.reference}`);
      lines.push("");
    });

    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `modelfit-report-${run.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !run) {
    return (
      <div className="flex min-h-screen bg-[#EEF1F4]">
        <Sidebar />
        <main className="flex-1 p-6 flex flex-col justify-center items-center">
          <div className="text-xs text-[#5C677D]">Loading benchmark run #{id}...</div>
        </main>
      </div>
    );
  }

  if (!run && !loading) {
    return (
      <div className="flex min-h-screen bg-[#EEF1F4]">
        <Sidebar />
        <main className="flex-1 p-6">
          <div className="p-4 bg-white border border-[#C9D0DB] rounded-[2px]">
            <h2 className="text-sm font-semibold text-[#101B33]">Run not found</h2>
            <p className="text-xs text-[#5C677D] mt-1">
              Could not find run #{id}. It may have been deleted or never created.
            </p>
            <Link
              href="/"
              className="inline-block mt-3 px-3 py-1 bg-[#2748F5] text-white text-xs rounded-[2px]"
            >
              Start new benchmark
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const phases = ["queued", "generating", "judging", "auditing", "done"];
  const currentPhaseIdx = phases.indexOf(run?.phase || "queued");

  const totalPrompts = run?.config.prompts.length || 0;
  const totalModels =
    (run?.config.models.length || 0) + (run?.config.cloud.length || 0);
  const totalExpectedResponses = totalPrompts * totalModels;
  const doneResponses = run?.responses.length || 0;
  const doneScores = run?.scores.length || 0;

  const isDone = run?.status === "done";
  const isRunning = run?.status === "running" || run?.status === "queued";

  const allModelNames = [
    ...(run?.config.models || []),
    ...(run?.config.cloud.map((c) => c.model) || []),
  ];

  const chartData = (run?.summary || [])
    .filter((s) => !s.failed)
    .map((s) => {
      const cost = axis === "memory" ? s.mem_gb : (s.total_ms || 0) / 1000.0;
      return {
        name: s.model,
        x: cost,
        y: s.quality,
        ci: s.quality_ci,
        isGoodEnough: rec?.good_enough.model === s.model,
        isLocal: s.provider === "ollama",
      };
    });

  const getModelLabel = (modelName: string) => {
    if (!blindMode) return modelName;
    const idx = allModelNames.indexOf(modelName);
    return `Model ${String.fromCharCode(65 + Math.max(0, idx))}`;
  };

  const getTrustBadgeColor = (label: string) => {
    if (label === "Reliable") return "bg-[#1F7A5A] text-white";
    if (label === "Use with caution") return "bg-[#101B33] text-white";
    return "bg-[#F4511E] text-white";
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-[#EEF1F4]">
      <Sidebar />

      <main className="flex-1 p-6 max-w-6xl overflow-x-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#C9D0DB] pb-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold text-[#5C677D]">
                #{run?.id}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full border border-[#C9D0DB] font-medium bg-white">
                {run?.status}
              </span>
            </div>
            <div className="text-xs text-[#5C677D] mt-0.5">
              {totalModels} models · {totalPrompts} prompts · {run?.config.passes} passes
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isRunning && (
              <button
                type="button"
                onClick={handleStopRun}
                className="px-3 py-1.5 text-xs font-semibold bg-[#F4511E] text-white rounded-[2px] hover:bg-[#D84315]"
              >
                Stop run
              </button>
            )}
            {isDone && (
              <button
                type="button"
                onClick={handleDownloadReport}
                className="px-3 py-1.5 text-xs font-semibold bg-[#101B33] text-white rounded-[2px] hover:bg-[#202E4E]"
              >
                Download report
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="p-3 mb-6 bg-[#F4511E]/10 border border-[#F4511E]/30 text-xs text-[#F4511E] rounded-[2px]">
            {error}
          </div>
        )}

        {run?.audit?.self_judged && (
          <div className="p-3 mb-6 bg-[#F4511E]/15 border border-[#F4511E] text-xs text-[#F4511E] font-medium rounded-[2px]">
            Notice: The judge model is also a candidate in this run and may favour its own style.
          </div>
        )}

        <div className="bg-white border border-[#C9D0DB] p-4 mb-6">
          <div className="flex items-center justify-between text-xs text-[#5C677D] mb-2 font-medium">
            <span>Phase progress: {run?.phase}</span>
            <span>
              Responses: {doneResponses}/{totalExpectedResponses} · Scores: {doneScores}
            </span>
          </div>
          <div className="flex border border-[#C9D0DB] overflow-hidden rounded-[2px]">
            {phases.map((ph, idx) => {
              const active = idx === currentPhaseIdx;
              const completed = idx < currentPhaseIdx || run?.status === "done";
              return (
                <div
                  key={ph}
                  className={`flex-1 text-center py-1.5 text-xs font-medium border-r last:border-r-0 border-[#C9D0DB] ${
                    active
                      ? "bg-[#2748F5] text-white font-semibold"
                      : completed
                      ? "bg-[#1F7A5A]/15 text-[#1F7A5A]"
                      : "bg-[#EEF1F4] text-[#5C677D]"
                  }`}
                >
                  {ph}
                </div>
              );
            })}
          </div>
        </div>

        {isRunning && (
          <section className="bg-white border border-[#C9D0DB] p-4 mb-6">
            <h2 className="text-sm font-semibold text-[#101B33] mb-3">
              Live generation matrix
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#C9D0DB] text-left text-[#5C677D]">
                    <th className="p-2 font-medium">Model</th>
                    {run?.config.prompts.map((_, pi) => (
                      <th key={pi} className="p-2 font-medium">
                        P{pi + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#C9D0DB]">
                  {allModelNames.map((m) => (
                    <tr key={m}>
                      <td className="p-2 font-medium text-[#101B33]">{m}</td>
                      {run?.config.prompts.map((_, pi) => {
                        const promptId = run.config.prompts[pi] ? pi + 1 : 0;
                        const resp = run.responses.find(
                          (r) => r.model === m && r.prompt_id === promptId
                        );
                        const hasScore = resp && run.scores.some((s) => s.response_id === resp.id);
                        return (
                          <td
                            key={pi}
                            className={`p-2 font-mono ${
                              hasScore ? "border-b-2 border-[#2748F5]" : ""
                            }`}
                          >
                            {resp ? (
                              resp.error ? (
                                <span className="text-[#F4511E]">error</span>
                              ) : (
                                <span className="text-[#1F7A5A] font-semibold">
                                  {resp.tps} tps
                                </span>
                              )
                            ) : (
                              <span className="text-[#C9D0DB]">···</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {isDone && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <div className="lg:col-span-2 bg-white border border-[#C9D0DB] p-5">
              <div className="flex flex-wrap items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-[#101B33]">
                    Efficiency frontier
                  </h2>
                  <p className="text-xs text-[#5C677D]">
                    Quality score vs. cost. The good-enough pick is circled in Moss.
                  </p>
                </div>
                <div className="flex items-center gap-1 bg-[#EEF1F4] p-1 border border-[#C9D0DB] rounded-[2px] text-xs">
                  <button
                    type="button"
                    onClick={() => setAxis("memory")}
                    className={`px-2 py-0.5 rounded-[2px] font-medium ${
                      axis === "memory"
                        ? "bg-white text-[#101B33] shadow-xs"
                        : "text-[#5C677D]"
                    }`}
                  >
                    Memory (GB)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAxis("latency")}
                    className={`px-2 py-0.5 rounded-[2px] font-medium ${
                      axis === "latency"
                        ? "bg-white text-[#101B33] shadow-xs"
                        : "text-[#5C677D]"
                    }`}
                  >
                    Latency (s)
                  </button>
                </div>
              </div>

              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
                    <XAxis
                      type="number"
                      dataKey="x"
                      name={axis === "memory" ? "Memory" : "Latency"}
                      unit={axis === "memory" ? "GB" : "s"}
                      stroke="#101B33"
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      type="number"
                      dataKey="y"
                      name="Quality"
                      domain={[0, 100]}
                      stroke="#101B33"
                      tick={{ fontSize: 11 }}
                    />
                    <RechartsTooltip
                      content={({ payload }) => {
                        if (!payload || payload.length === 0) return null;
                        const data = payload[0].payload;
                        return (
                          <div className="bg-[#101B33] text-white p-2 text-xs rounded-[2px]">
                            <div className="font-bold">{data.name}</div>
                            <div>Quality: {data.y}/100</div>
                            <div>
                              {axis === "memory" ? "Memory" : "Latency"}: {data.x}{" "}
                              {axis === "memory" ? "GB" : "s"}
                            </div>
                            {data.isGoodEnough && (
                              <div className="text-[#1F7A5A] font-semibold mt-1">
                                ✓ Good enough pick
                              </div>
                            )}
                          </div>
                        );
                      }}
                    />
                    <Scatter name="Models" data={chartData}>
                      {chartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.isGoodEnough ? "#1F7A5A" : entry.isLocal ? "#101B33" : "transparent"}
                          stroke={entry.isGoodEnough ? "#1F7A5A" : "#101B33"}
                          strokeWidth={entry.isGoodEnough ? 3 : 1.5}
                        />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>

              {run?.summary.some((s) => s.failed) && (
                <div className="mt-4 pt-3 border-t border-[#C9D0DB]">
                  <h3 className="text-xs font-semibold text-[#F4511E] mb-2">
                    Failed models (omitted from frontier)
                  </h3>
                  <div className="divide-y divide-[#C9D0DB] border border-[#C9D0DB] text-xs">
                    {run.summary
                      .filter((s) => s.failed)
                      .map((s) => (
                        <div key={s.model} className="p-2 flex justify-between">
                          <span className="font-medium text-[#101B33]">{s.model}</span>
                          <span className="text-[#F4511E]">{s.errors} prompt errors</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-[#F7F9FB] border border-[#C9D0DB] p-5 flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-bold text-[#1F7A5A] uppercase tracking-wide">
                  Good enough pick
                </span>
                <div className="text-2xl font-bold tracking-tight text-[#101B33] mt-1 mb-1">
                  {rec?.good_enough.model || "..."}
                </div>
                <p className="text-xs text-[#5C677D] leading-relaxed mb-4">
                  {rec?.good_enough.reason}
                </p>

                <div className="border-t border-[#C9D0DB] pt-3 mb-4">
                  <span className="text-[11px] font-bold text-[#2748F5] uppercase tracking-wide">
                    Best overall
                  </span>
                  <div className="text-base font-semibold text-[#101B33] mt-0.5">
                    {rec?.best.model || "..."}
                  </div>
                  <p className="text-xs text-[#5C677D] leading-relaxed">
                    {rec?.best.reason}
                  </p>
                </div>

                <div className="border-t border-[#C9D0DB] pt-3 mb-4">
                  <span className="text-[11px] font-semibold text-[#101B33] block mb-2">
                    Good enough threshold
                  </span>
                  <div className="flex gap-1">
                    {[0.8, 0.9, 0.95].map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setThreshold(t)}
                        className={`flex-1 py-1 text-xs border border-[#C9D0DB] rounded-[2px] font-medium ${
                          threshold === t
                            ? "bg-[#101B33] text-white"
                            : "bg-white text-[#101B33]"
                        }`}
                      >
                        {Math.round(t * 100)}%
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span>Quality weight</span>
                      <span className="font-mono">{qualityW}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      value={qualityW}
                      onChange={(e) => setQualityW(Number(e.target.value))}
                      className="w-full accent-[#2748F5]"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span>Speed weight</span>
                      <span className="font-mono">{speedW}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      value={speedW}
                      onChange={(e) => setSpeedW(Number(e.target.value))}
                      className="w-full accent-[#2748F5]"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span>Memory weight</span>
                      <span className="font-mono">{memoryW}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      value={memoryW}
                      onChange={(e) => setMemoryW(Number(e.target.value))}
                      className="w-full accent-[#2748F5]"
                    />
                  </div>
                </div>
              </div>

              {rec?.ranking && (
                <div className="mt-4 pt-3 border-t border-[#C9D0DB]">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[#5C677D] border-b border-[#C9D0DB] text-left">
                        <th className="pb-1 font-medium">Rank</th>
                        <th className="pb-1 font-medium">Model</th>
                        <th className="pb-1 font-medium text-right">Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#C9D0DB]/50">
                      {rec.ranking.map((r, i) => (
                        <tr key={r.model}>
                          <td className="py-1 font-mono text-[#5C677D]">{i + 1}</td>
                          <td className="py-1 font-medium text-[#101B33]">
                            {r.model}
                          </td>
                          <td className="py-1 font-mono font-semibold text-right text-[#2748F5]">
                            {r.score}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="border-b border-[#C9D0DB] flex items-center justify-between mb-4">
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setActiveTab("responses")}
              className={`pb-2 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === "responses"
                  ? "border-[#2748F5] text-[#2748F5]"
                  : "border-transparent text-[#5C677D] hover:text-[#101B33]"
              }`}
            >
              Responses & scoring
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("audit")}
              className={`pb-2 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === "audit"
                  ? "border-[#2748F5] text-[#2748F5]"
                  : "border-transparent text-[#5C677D] hover:text-[#101B33]"
              }`}
            >
              Judge audit breakdown
            </button>
          </div>

          {activeTab === "responses" && (
            <div className="flex items-center gap-2 mb-2">
              <label className="text-xs text-[#5C677D] font-medium cursor-pointer">
                Blind mode (hide model names)
              </label>
              <input
                type="checkbox"
                checked={blindMode}
                onChange={(e) => setBlindMode(e.target.checked)}
                className="rounded-[2px] border-[#C9D0DB] text-[#2748F5]"
              />
            </div>
          )}
        </div>

        {activeTab === "responses" && (
          <div className="bg-white border border-[#C9D0DB] p-4">
            <div className="flex flex-wrap items-center gap-2 mb-4 pb-3 border-b border-[#C9D0DB]">
              <span className="text-xs font-medium text-[#5C677D]">Prompt:</span>
              {run?.config.prompts.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedPromptIdx(i)}
                  className={`px-2.5 py-1 text-xs rounded-[2px] border font-medium ${
                    selectedPromptIdx === i
                      ? "bg-[#101B33] text-white border-[#101B33]"
                      : "bg-[#EEF1F4] text-[#101B33] border-[#C9D0DB] hover:bg-[#E2E6EB]"
                  }`}
                >
                  Prompt {i + 1}
                </button>
              ))}
            </div>

            {run?.config.prompts[selectedPromptIdx] && (
              <div className="p-3 bg-[#F7F9FB] border border-[#C9D0DB] rounded-[2px] mb-4 text-xs">
                <div className="font-semibold text-[#101B33] mb-1">Task:</div>
                <div className="text-[#101B33] whitespace-pre-wrap">
                  {run.config.prompts[selectedPromptIdx].text}
                </div>
                {run.config.prompts[selectedPromptIdx].reference && (
                  <div className="mt-2 pt-2 border-t border-[#C9D0DB] text-[#5C677D]">
                    <span className="font-medium text-[#101B33]">Reference: </span>
                    {run.config.prompts[selectedPromptIdx].reference}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {allModelNames.map((m) => {
                const promptId = run ? selectedPromptIdx + 1 : 0;
                const resp = run?.responses.find(
                  (r) => r.model === m && r.prompt_id === promptId
                );
                const score = resp ? run?.scores.find((s) => s.response_id === resp.id) : null;

                return (
                  <div
                    key={m}
                    className="border border-[#C9D0DB] bg-[#F7F9FB] flex flex-col justify-between"
                  >
                    <div className="p-3 border-b border-[#C9D0DB] flex justify-between items-center bg-white">
                      <span className="font-semibold text-xs text-[#101B33]">
                        {getModelLabel(m)}
                      </span>
                      {score?.overall !== undefined && score.overall !== null && (
                        <span className="font-mono text-xs font-bold text-[#2748F5]">
                          {score.overall}/10
                        </span>
                      )}
                    </div>

                    <div className="p-3 text-xs flex-1">
                      {resp ? (
                        resp.error ? (
                          <div className="text-[#F4511E]">{resp.error}</div>
                        ) : (
                          <div className="whitespace-pre-wrap text-[#101B33] leading-relaxed max-h-60 overflow-y-auto">
                            {resp.text}
                          </div>
                        )
                      ) : (
                        <div className="text-[#5C677D] italic">Waiting for response...</div>
                      )}
                    </div>

                    {score && (
                      <div className="p-3 bg-white border-t border-[#C9D0DB] text-[11px] text-[#5C677D]">
                        <div className="grid grid-cols-2 gap-1 mb-2 font-mono">
                          <div>Correct: {score.correctness}</div>
                          <div>Complete: {score.completeness}</div>
                          <div>Clarity: {score.clarity}</div>
                          <div>Instruct: {score.instruction_following}</div>
                        </div>
                        {score.rationale && (
                          <div className="italic text-[#101B33] border-t border-[#C9D0DB]/60 pt-1">
                            "{score.rationale}"
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "audit" && (
          <div className="bg-white border border-[#C9D0DB] p-5">
            {run?.audit ? (
              <div>
                <div className="flex flex-wrap items-baseline gap-4 mb-4 pb-4 border-b border-[#C9D0DB]">
                  <div>
                    <span className="text-xs text-[#5C677D] font-medium block">
                      Judge trust score
                    </span>
                    <div className="text-4xl font-bold font-mono tracking-tight text-[#101B33]">
                      {run.audit.trust}
                      <span className="text-base text-[#5C677D] font-normal">/100</span>
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-[2px] font-semibold ${getTrustBadgeColor(
                      run.audit.label
                    )}`}
                  >
                    {run.audit.label}
                  </span>
                </div>

                {run.audit.notes.length > 0 && (
                  <div className="mb-6 p-3 bg-[#EEF1F4] border border-[#C9D0DB] rounded-[2px]">
                    <div className="text-xs font-semibold text-[#101B33] mb-1">
                      Audit observations
                    </div>
                    <ul className="text-xs text-[#101B33] list-disc list-inside space-y-1">
                      {run.audit.notes.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 border border-[#C9D0DB] bg-[#F7F9FB]">
                    <h3 className="text-xs font-bold text-[#101B33] mb-1">
                      1. Retest consistency
                    </h3>
                    <p className="text-xs text-[#5C677D] mb-3">
                      Compares Pass 1 vs Pass 2 scores for each response.
                    </p>
                    <div className="flex gap-4 text-xs font-mono">
                      <div>
                        <span className="text-[#5C677D] block">Spearman rho</span>
                        <span className="font-bold text-[#101B33]">
                          {run.audit.retest.rho}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#5C677D] block">MAD</span>
                        <span className="font-bold text-[#101B33]">
                          {run.audit.retest.mad}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#5C677D] block">Pairs</span>
                        <span className="font-bold text-[#101B33]">
                          {run.audit.retest.n}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 border border-[#C9D0DB] bg-[#F7F9FB]">
                    <h3 className="text-xs font-bold text-[#101B33] mb-1">
                      2. Length bias
                    </h3>
                    <p className="text-xs text-[#5C677D] mb-3">
                      Correlation between response length and awarded scores.
                    </p>
                    <div className="flex gap-4 text-xs font-mono">
                      <div>
                        <span className="text-[#5C677D] block">Pearson r</span>
                        <span className="font-bold text-[#101B33]">
                          {run.audit.length.r}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#5C677D] block">Flagged</span>
                        <span
                          className={`font-bold ${
                            run.audit.length.flag
                              ? "text-[#F4511E]"
                              : "text-[#1F7A5A]"
                          }`}
                        >
                          {run.audit.length.flag ? "YES" : "NO"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 border border-[#C9D0DB] bg-[#F7F9FB]">
                    <h3 className="text-xs font-bold text-[#101B33] mb-1">
                      3. Order bias (pairwise swap)
                    </h3>
                    <p className="text-xs text-[#5C677D] mb-3">
                      Measures whether swapping candidate presentation order flips the verdict.
                    </p>
                    <div className="flex gap-4 text-xs font-mono">
                      <div>
                        <span className="text-[#5C677D] block">Consistency</span>
                        <span className="font-bold text-[#101B33]">
                          {Math.round(run.audit.order.consistency * 100)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-[#5C677D] block">A win rate</span>
                        <span className="font-bold text-[#101B33]">
                          {Math.round(run.audit.order.a_win_rate * 100)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-[#5C677D] block">Pairs</span>
                        <span className="font-bold text-[#101B33]">
                          {run.audit.order.pairs}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 border border-[#C9D0DB] bg-[#F7F9FB]">
                    <h3 className="text-xs font-bold text-[#101B33] mb-1">
                      4. Cross-judge agreement
                    </h3>
                    <p className="text-xs text-[#5C677D] mb-3">
                      Agreement with secondary cloud judge (optional).
                    </p>
                    <div className="text-xs text-[#5C677D]">
                      {run.audit.cross ? (
                        JSON.stringify(run.audit.cross)
                      ) : (
                        <span>Not run (cross-judge disabled or missing API key).</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-[#5C677D]">
                Audit will run automatically once scoring completes.
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
