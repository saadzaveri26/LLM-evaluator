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
  CartesianGrid,
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
        <div className="flex min-h-screen bg-grid">
          <aside className="w-full md:w-[260px] md:min-w-[260px] md:h-screen border-r border-[#1B2A4D] bg-[#101B33] shrink-0" />
          <main className="flex-1 p-6 md:p-10 max-w-[1120px]">
            <div className="h-0.5 w-full bg-[#2748F5] animate-pulse mb-6" />
            <div className="text-xs text-[#475569]">Loading benchmark run...</div>
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

  const isDone = run?.status === "done";
  useEffect(() => {
    if (!isDone) return;
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
  }, [id, isDone, qualityW, speedW, memoryW, axis, threshold]);

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
      <div className="flex flex-col md:flex-row min-h-screen bg-grid">
        <Sidebar />
        <main className="flex-1 p-6 md:p-10 max-w-[1120px]">
          <div className="h-0.5 w-full bg-[#2748F5] animate-pulse mb-6" />
          <div className="text-xs text-[#475569]">Loading benchmark run #{id}...</div>
        </main>
      </div>
    );
  }

  if (!run && !loading) {
    return (
      <div className="flex flex-col md:flex-row min-h-screen bg-grid">
        <Sidebar />
        <main className="flex-1 p-6 md:p-10 max-w-[1120px]">
          <div className="p-8 bg-[#F9FAFC] border border-[#C9D0DB]">
            <h2 className="text-lg font-bold text-[#101B33]">Run not found</h2>
            <p className="text-xs text-[#475569] mt-2 leading-relaxed">
              Could not find run #{id}. It may have been deleted or never created.
            </p>
            <Link
              href="/"
              className="inline-block mt-4 px-4 py-2 bg-[#2748F5] text-white text-xs font-medium rounded-[2px]"
            >
              Start new benchmark
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (!run) return null;

  const totalPrompts = run.config.prompts.length;
  const totalModels = run.config.models.length + run.config.cloud.length;
  const totalExpectedResponses = totalPrompts * totalModels;
  const doneResponses = run.responses.length;
  const doneScores = run.scores.length;

  const isRunning = run.status === "running" || run.status === "queued";

  const allModelNames = [
    ...run.config.models,
    ...run.config.cloud.map((c) => c.model),
  ];

  const chartData = (run.summary || [])
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

  const getTrustColor = (label: string) => {
    if (label === "Reliable") return "text-[#1F7A5A]";
    if (label === "Use with caution") return "text-[#101B33]";
    return "text-[#F4511E]";
  };

  const renderCustomDot = (dotProps: { cx?: number; cy?: number; payload?: (typeof chartData)[0] }) => {
    const { cx, cy, payload } = dotProps;
    if (cx === undefined || cy === undefined || !payload) return null;
    const isGoodEnough = payload.isGoodEnough;
    const label = getModelLabel(payload.name);

    return (
      <g key={`dot-${payload.name}`}>
        {payload.ci && (
          <line
            x1={cx}
            y1={cy - 12}
            x2={cx}
            y2={cy + 12}
            stroke="#2748F5"
            strokeWidth={1.5}
            opacity={0.8}
          />
        )}
        {isGoodEnough && (
          <>
            <circle
              cx={cx}
              cy={cy}
              r={14}
              stroke="#1F7A5A"
              strokeWidth={2}
              fill="none"
              className="animate-ring"
            />
            <text
              x={cx}
              y={cy - 20}
              textAnchor="middle"
              fill="#1F7A5A"
              fontSize={11}
              fontWeight={700}
            >
              Good enough
            </text>
          </>
        )}
        <circle
          cx={cx}
          cy={cy}
          r={isGoodEnough ? 6 : 4.5}
          fill={isGoodEnough ? "#1F7A5A" : payload.isLocal ? "#101B33" : "#475569"}
        />
        <text
          x={cx + 10}
          y={cy + 4}
          fill="#101B33"
          fontSize={11}
          fontWeight={isGoodEnough ? 600 : 400}
        >
          {label}
        </text>
      </g>
    );
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-grid">
      <Sidebar />

      <main className="flex-1 p-6 md:p-10 max-w-[1120px] overflow-x-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#C9D0DB] pb-6 mb-8">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-[#101B33]">
                #{run.id}
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full border border-[#C9D0DB] bg-white font-medium text-[#101B33]">
                {run.status}
              </span>
              <span className="text-xs text-[#475569]">
                <span className="num">{totalModels}</span> {totalModels === 1 ? "model" : "models"}, <span className="num">{totalPrompts}</span> {totalPrompts === 1 ? "prompt" : "prompts"}, <span className="num">{run.config.passes}</span> {run.config.passes === 1 ? "pass" : "passes"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isRunning && (
              <button
                type="button"
                onClick={handleStopRun}
                className="px-4 py-2 text-xs font-semibold bg-[#F4511E] text-white rounded-[2px] hover:bg-[#D84315] transition-colors"
              >
                Stop run
              </button>
            )}
            {isDone && (
              <button
                type="button"
                onClick={handleDownloadReport}
                className="px-4 py-2 text-xs font-semibold bg-[#101B33] text-white rounded-[2px] hover:bg-[#1B2A4D] transition-colors"
              >
                Download report
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="p-4 mb-8 bg-[#FFE3D9] border border-[#F4511E] text-xs text-[#F4511E] rounded-[2px]">
            {error}
          </div>
        )}

        {run.audit?.self_judged && (
          <div className="p-4 mb-8 bg-[#FFE3D9] border border-[#F4511E] text-xs text-[#F4511E] font-medium rounded-[2px]">
            The judge model is also a candidate in this run and may favour its own style.
          </div>
        )}

        <div className="bg-[#F9FAFC] border border-[#C9D0DB] p-6 mb-8">
          <div className="flex items-center justify-between text-xs text-[#475569] mb-4">
            <span className="font-medium text-[#101B33]">Phase: {run.phase}</span>
            <span>
              Responses: <span className="num">{doneResponses}</span>/<span className="num">{totalExpectedResponses}</span> · Scores: <span className="num">{doneScores}</span>
            </span>
          </div>
          <div className="relative flex items-center justify-between">
            <div className="absolute left-6 right-6 top-3 h-[2px] bg-[#C9D0DB] z-0" />
            {["generating", "judging", "auditing", "done"].map((ph, idx) => {
              const phOrder = ["queued", "generating", "judging", "auditing", "done"];
              const currIdx = phOrder.indexOf(run.phase || "queued");
              const stepIdx = phOrder.indexOf(ph);
              const isFinished = run.status === "done" || currIdx > stepIdx;
              const isCurrent = run.phase === ph && run.status !== "done";

              let circleClass = "bg-white border-[#C9D0DB] text-[#475569]";
              if (isFinished) circleClass = "bg-[#1F7A5A] border-[#1F7A5A] text-white";
              else if (isCurrent) circleClass = "bg-[#2748F5] border-[#2748F5] text-white ring-4 ring-[#DCE3FF]";

              return (
                <div key={ph} className="relative z-10 flex flex-col items-center">
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-colors ${circleClass}`}>
                    {isFinished ? "✓" : idx + 1}
                  </div>
                  <span className={`text-xs mt-2 font-medium ${isCurrent ? "text-[#2748F5] font-bold" : isFinished ? "text-[#1F7A5A]" : "text-[#475569]"}`}>
                    {ph}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {isRunning && (
          <section className="bg-[#F9FAFC] border border-[#C9D0DB] p-6 mb-8">
            <h2 className="text-sm font-semibold text-[#101B33] mb-4">
              Live generation matrix
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left border-b border-[#C9D0DB] text-[#475569]">
                    <th className="pb-2 font-medium">Model</th>
                    <th className="pb-2 font-medium text-right">TTFT</th>
                    <th className="pb-2 font-medium text-right">Total time</th>
                    <th className="pb-2 font-medium text-right">Tokens/s</th>
                    <th className="pb-2 font-medium text-right">Tokens</th>
                    <th className="pb-2 font-medium text-right">Memory</th>
                    <th className="pb-2 font-medium text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#C9D0DB]">
                  {allModelNames.map((m) => {
                    const modelResponses = run.responses.filter((r) => r.model === m);
                    const latest = modelResponses[modelResponses.length - 1];
                    const summaryItem = run.summary?.find((s) => s.model === m);

                    return (
                      <tr key={m}>
                        <td className="py-2.5 font-medium text-[#101B33]">{m}</td>
                        <td className="py-2.5 text-right text-[#475569] num">
                          {latest?.ttft_ms ? `${Math.round(latest.ttft_ms)} ms` : "—"}
                        </td>
                        <td className="py-2.5 text-right text-[#475569] num">
                          {latest?.total_ms ? `${(latest.total_ms / 1000).toFixed(1)} s` : "—"}
                        </td>
                        <td className="py-2.5 text-right text-[#101B33] font-medium num">
                          {latest?.tps ? `${latest.tps.toFixed(1)}` : "—"}
                        </td>
                        <td className="py-2.5 text-right text-[#475569] num">
                          {latest?.out_tokens || "—"}
                        </td>
                        <td className="py-2.5 text-right text-[#101B33] num">
                          {summaryItem?.mem_gb ? `${summaryItem.mem_gb.toFixed(1)} GB` : "—"}
                        </td>
                        <td className="py-2.5 text-center">
                          {modelResponses.length >= totalPrompts ? (
                            <span className="text-[#1F7A5A] font-semibold text-[11px]">Done</span>
                          ) : latest ? (
                            <span className="text-[#2748F5] text-[11px]">Prompt {latest.prompt_id}/{totalPrompts}</span>
                          ) : (
                            <span className="text-[#475569] text-[11px]">Queued</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {isDone && (
          <div className="space-y-8 mb-8">
            <div className="bg-[#F9FAFC] border border-[#C9D0DB] p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-base font-bold text-[#101B33]">
                    Pareto efficiency frontier
                  </h2>
                  <p className="text-xs text-[#475569]">
                    Trade-off between response quality and resource cost.
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-[#475569]">Cost axis:</span>
                  <div className="flex border border-[#C9D0DB] rounded-[2px] overflow-hidden bg-white">
                    <button
                      type="button"
                      onClick={() => setAxis("memory")}
                      className={`px-3 py-1 font-medium transition-colors ${
                        axis === "memory"
                          ? "bg-[#101B33] text-white"
                          : "text-[#101B33] hover:bg-[#EEF1F4]"
                      }`}
                    >
                      Memory (GB)
                    </button>
                    <button
                      type="button"
                      onClick={() => setAxis("latency")}
                      className={`px-3 py-1 font-medium transition-colors ${
                        axis === "latency"
                          ? "bg-[#101B33] text-white"
                          : "text-[#101B33] hover:bg-[#EEF1F4]"
                      }`}
                    >
                      Latency (seconds)
                    </button>
                  </div>
                </div>
              </div>

              <div className="w-full h-[480px] bg-white border border-[#C9D0DB] p-4 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 30, right: 120, bottom: 30, left: 20 }}>
                    <CartesianGrid stroke="#C9D0DB" strokeDasharray="3 3" opacity={0.6} />
                    <XAxis
                      type="number"
                      dataKey="x"
                      name={axis === "memory" ? "Memory (GB)" : "Latency (seconds)"}
                      label={{
                        value: axis === "memory" ? "Memory (GB)" : "Latency (seconds)",
                        position: "insideBottom",
                        offset: -15,
                        fontSize: 12,
                        fill: "#101B33",
                        fontWeight: 500,
                      }}
                      domain={[0, (dataMax: number) => Math.max(2, Math.ceil(dataMax * 1.3))]}
                      stroke="#C9D0DB"
                      tick={{ fill: "#475569", fontSize: 11 }}
                    />
                    <YAxis
                      type="number"
                      dataKey="y"
                      domain={[0, 100]}
                      name="Quality score"
                      label={{
                        value: "Quality score",
                        angle: -90,
                        position: "insideLeft",
                        offset: 0,
                        fontSize: 12,
                        fill: "#101B33",
                        fontWeight: 500,
                      }}
                      stroke="#C9D0DB"
                      tick={{ fill: "#475569", fontSize: 11 }}
                    />
                    <RechartsTooltip
                      content={({ payload }) => {
                        if (!payload || payload.length === 0) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="p-3 bg-[#101B33] text-white text-xs rounded-[2px] shadow-none">
                            <div className="font-bold mb-1">{getModelLabel(d.name)}</div>
                            <div>Quality: <span className="num font-semibold">{d.y}%</span></div>
                            <div>
                              {axis === "memory" ? "Memory:" : "Latency:"}{" "}
                              <span className="num font-semibold">
                                {d.x} {axis === "memory" ? "GB" : "s"}
                              </span>
                            </div>
                            {d.isGoodEnough && (
                              <div className="mt-1 text-[#1F7A5A] font-bold text-[11px]">
                                ★ Recommended good enough
                              </div>
                            )}
                          </div>
                        );
                      }}
                    />
                    <Scatter
                      data={chartData}
                      shape={renderCustomDot}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>

              {run.summary?.some((s) => s.failed) && (
                <div className="mt-4 p-3 bg-[#FFE3D9] border border-[#F4511E] rounded-[2px]">
                  <div className="text-xs font-bold text-[#F4511E] mb-1">
                    Failed models:
                  </div>
                  <div className="divide-y divide-[#F4511E]/30 text-xs">
                    {run.summary
                      .filter((s) => s.failed)
                      .map((s) => (
                        <div key={s.model} className="py-1 flex justify-between">
                          <span className="font-medium text-[#101B33]">{s.model}</span>
                          <span className="text-[#F4511E] num">{s.errors} {s.errors === 1 ? "prompt error" : "prompt errors"}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-[#F9FAFC] border border-[#C9D0DB] p-8">
              <div className="mb-6">
                <span className="text-xs font-semibold text-[#1F7A5A] block mb-1">
                  Good enough pick
                </span>
                <div className="text-[40px] font-bold tracking-tight text-[#101B33] leading-none mb-2">
                  {rec?.good_enough.model || "..."}
                </div>
                <p className="text-[15px] text-[#475569] leading-relaxed max-w-3xl">
                  {rec?.good_enough.reason}
                </p>
              </div>

              <div className="pt-6 border-t border-[#C9D0DB] mb-6">
                <span className="text-xs font-semibold text-[#2748F5] block mb-1">
                  Best overall candidate
                </span>
                <div className="text-xl font-bold text-[#101B33] mb-1">
                  {rec?.best.model || "..."}
                </div>
                <p className="text-xs text-[#475569] leading-relaxed max-w-3xl">
                  {rec?.best.reason}
                </p>
              </div>

              <div className="pt-6 border-t border-[#C9D0DB] mb-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-medium text-[#101B33]">
                    Good enough quality threshold
                  </span>
                  <div className="flex gap-2">
                    {[0.8, 0.9, 0.95].map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setThreshold(t)}
                        className={`px-3 py-1 text-xs border border-[#C9D0DB] rounded-[2px] font-medium transition-colors ${
                          threshold === t
                            ? "bg-[#101B33] text-white border-[#101B33]"
                            : "bg-white text-[#101B33] hover:bg-[#EEF1F4]"
                        }`}
                      >
                        <span className="num">{Math.round(t * 100)}</span>%
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-[#101B33]">Quality weight</span>
                      <span className="num font-bold text-sm text-[#101B33]">{qualityW}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      value={qualityW}
                      onChange={(e) => setQualityW(Number(e.target.value))}
                      style={{
                        background: `linear-gradient(to right, #2748F5 0%, #2748F5 ${qualityW * 10}%, #C9D0DB ${qualityW * 10}%, #C9D0DB 100%)`,
                      }}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-[#101B33]">Speed weight</span>
                      <span className="num font-bold text-sm text-[#101B33]">{speedW}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      value={speedW}
                      onChange={(e) => setSpeedW(Number(e.target.value))}
                      style={{
                        background: `linear-gradient(to right, #2748F5 0%, #2748F5 ${speedW * 10}%, #C9D0DB ${speedW * 10}%, #C9D0DB 100%)`,
                      }}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-[#101B33]">Memory weight</span>
                      <span className="num font-bold text-sm text-[#101B33]">{memoryW}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      value={memoryW}
                      onChange={(e) => setMemoryW(Number(e.target.value))}
                      style={{
                        background: `linear-gradient(to right, #2748F5 0%, #2748F5 ${memoryW * 10}%, #C9D0DB ${memoryW * 10}%, #C9D0DB 100%)`,
                      }}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              {rec?.ranking && (
                <div className="pt-6 border-t border-[#C9D0DB]">
                  <h3 className="text-xs font-semibold text-[#101B33] mb-3">
                    Ranked model breakdown
                  </h3>
                  <div className="border border-[#C9D0DB] bg-white">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[#475569] border-b border-[#C9D0DB] text-left bg-[#F9FAFC]">
                          <th className="p-3 font-medium">Rank</th>
                          <th className="p-3 font-medium">Model</th>
                          <th className="p-3 font-medium text-right">Composite score</th>
                          <th className="p-3 font-medium text-right">Quality</th>
                          <th className="p-3 font-medium text-right">Tokens/s</th>
                          <th className="p-3 font-medium text-right">Memory</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#C9D0DB]">
                        {rec.ranking.map((r, i) => (
                          <tr key={r.model}>
                            <td className="p-3 text-[#475569] num">{i + 1}</td>
                            <td className="p-3 font-medium text-[#101B33]">{r.model}</td>
                            <td className="p-3 font-bold text-right text-[#2748F5] num">
                              {r.score}
                            </td>
                            <td className="p-3 text-right text-[#101B33] num">
                              {r.quality}%
                            </td>
                            <td className="p-3 text-right text-[#475569] num">
                              {r.tps.toFixed(1)}
                            </td>
                            <td className="p-3 text-right text-[#475569] num">
                              {r.mem_gb.toFixed(1)} GB
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-8 border-b border-[#C9D0DB] mb-6">
          <button
            type="button"
            onClick={() => setActiveTab("responses")}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 -mb-[1px] ${
              activeTab === "responses"
                ? "border-[#2748F5] text-[#2748F5] font-bold"
                : "border-transparent text-[#475569] hover:text-[#101B33]"
            }`}
          >
            Prompt responses
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("audit")}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 -mb-[1px] ${
              activeTab === "audit"
                ? "border-[#2748F5] text-[#2748F5] font-bold"
                : "border-transparent text-[#475569] hover:text-[#101B33]"
            }`}
          >
            Judge audit
          </button>
        </div>

        {activeTab === "responses" && (
          <div className="bg-[#F9FAFC] border border-[#C9D0DB] p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-[#C9D0DB]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-[#475569]">Prompt:</span>
                {run.config.prompts.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedPromptIdx(i)}
                    className={`px-3 py-1 text-xs rounded-[2px] border font-medium transition-colors ${
                      selectedPromptIdx === i
                        ? "bg-[#101B33] text-white border-[#101B33]"
                        : "bg-white text-[#101B33] border-[#C9D0DB] hover:bg-[#EEF1F4]"
                    }`}
                  >
                    Prompt <span className="num">{i + 1}</span>
                  </button>
                ))}
              </div>

              <label className="flex items-center gap-2 text-xs text-[#475569] font-medium cursor-pointer">
                <span>Blind mode (hide model names)</span>
                <input
                  type="checkbox"
                  checked={blindMode}
                  onChange={(e) => setBlindMode(e.target.checked)}
                  className="rounded-[2px] border-[#C9D0DB] text-[#2748F5]"
                />
              </label>
            </div>

            {run.config.prompts[selectedPromptIdx] && (
              <div className="p-4 bg-white border border-[#C9D0DB] rounded-[2px] mb-6 text-xs">
                <div className="font-semibold text-[#101B33] mb-1">Evaluated task</div>
                <div className="text-[#101B33] whitespace-pre-wrap leading-relaxed">
                  {run.config.prompts[selectedPromptIdx].text}
                </div>
                {run.config.prompts[selectedPromptIdx].reference && (
                  <div className="mt-3 pt-3 border-t border-[#C9D0DB] text-[#475569]">
                    <span className="font-medium text-[#101B33]">Reference answer: </span>
                    {run.config.prompts[selectedPromptIdx].reference}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {allModelNames.map((m) => {
                const promptId = selectedPromptIdx + 1;
                const resp = run.responses.find(
                  (r) => r.model === m && r.prompt_id === promptId
                );
                const score = resp ? run.scores.find((s) => s.response_id === resp.id) : null;

                return (
                  <div
                    key={m}
                    className="border border-[#C9D0DB] bg-white flex flex-col justify-between"
                  >
                    <div className="p-3 border-b border-[#C9D0DB] flex justify-between items-center bg-[#F9FAFC]">
                      <span className="font-medium text-xs text-[#101B33]">
                        {getModelLabel(m)}
                      </span>
                      {score?.overall !== undefined && score.overall !== null && (
                        <span className="text-xs font-bold text-[#2748F5] num">
                          {score.overall}/10
                        </span>
                      )}
                    </div>

                    <div className="p-4 text-xs flex-1">
                      {resp ? (
                        resp.error ? (
                          <div className="text-[#F4511E]">{resp.error}</div>
                        ) : (
                          <div className="whitespace-pre-wrap text-[#101B33] leading-relaxed max-h-60 overflow-y-auto">
                            {resp.text}
                          </div>
                        )
                      ) : (
                        <div className="text-[#475569] italic">Waiting for response...</div>
                      )}
                    </div>

                    {score && (
                      <div className="p-3 bg-[#F9FAFC] border-t border-[#C9D0DB] text-[11px] text-[#475569]">
                        <div className="grid grid-cols-2 gap-1 mb-2">
                          <div>Correct: <span className="num">{score.correctness}</span></div>
                          <div>Complete: <span className="num">{score.completeness}</span></div>
                          <div>Clarity: <span className="num">{score.clarity}</span></div>
                          <div>Instruct: <span className="num">{score.instruction_following}</span></div>
                        </div>
                        {score.rationale && (
                          <div className="italic text-[#101B33] border-t border-[#C9D0DB] pt-2 leading-snug">
                            &ldquo;{score.rationale}&rdquo;
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
          <div className="bg-[#F9FAFC] border border-[#C9D0DB] p-8">
            {run.audit ? (
              <div className="space-y-8">
                <div className="flex flex-wrap items-baseline gap-6 pb-6 border-b border-[#C9D0DB]">
                  <div>
                    <span className="text-xs text-[#475569] font-medium block mb-1">
                      Judge trust score
                    </span>
                    <div className={`text-[72px] font-bold tracking-tight leading-none num ${getTrustColor(run.audit.label)}`}>
                      {run.audit.trust}
                      <span className="text-2xl text-[#475569] font-normal">/100</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-[#101B33] mb-1">
                      {run.audit.label}
                    </div>
                    <p className="text-xs text-[#475569] max-w-md leading-relaxed">
                      Calculated from duplicate consistency, length correlation, and pairwise position symmetry of Gemma 4.
                    </p>
                  </div>
                </div>

                {run.audit.notes.length > 0 && (
                  <div className="p-4 bg-[#FFE3D9] border border-[#F4511E] rounded-[2px]">
                    <div className="text-xs font-bold text-[#F4511E] mb-2">
                      Audit diagnostic observations
                    </div>
                    <ul className="text-xs text-[#101B33] list-disc list-inside space-y-1">
                      {run.audit.notes.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-6 border border-[#C9D0DB] bg-white">
                    <h3 className="text-xs font-bold text-[#101B33] mb-1">
                      1. Retest consistency
                    </h3>
                    <p className="text-xs text-[#475569] mb-4 leading-relaxed">
                      Measures whether Gemma 4 awards identical scores to the same response when evaluated twice.
                    </p>
                    <div className="flex gap-6 text-xs">
                      <div>
                        <span className="text-[#475569] block">Spearman rho</span>
                        <span className="font-bold text-[#101B33] text-sm num">
                          {run.audit.retest.rho}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#475569] block">MAD error</span>
                        <span className="font-bold text-[#101B33] text-sm num">
                          {run.audit.retest.mad}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#475569] block">Evaluated pairs</span>
                        <span className="font-bold text-[#101B33] text-sm num">
                          {run.audit.retest.n}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 border border-[#C9D0DB] bg-white">
                    <h3 className="text-xs font-bold text-[#101B33] mb-1">
                      2. Length bias
                    </h3>
                    <p className="text-xs text-[#475569] mb-4 leading-relaxed">
                      Checks if the judge automatically assigns higher marks to longer responses regardless of quality.
                    </p>
                    <div className="flex gap-6 text-xs">
                      <div>
                        <span className="text-[#475569] block">Pearson r</span>
                        <span className="font-bold text-[#101B33] text-sm num">
                          {run.audit.length.r}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#475569] block">Bias flagged</span>
                        <span
                          className={`font-bold text-sm ${
                            run.audit.length.flag
                              ? "text-[#F4511E]"
                              : "text-[#1F7A5A]"
                          }`}
                        >
                          {run.audit.length.flag ? "Yes" : "No"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 border border-[#C9D0DB] bg-white">
                    <h3 className="text-xs font-bold text-[#101B33] mb-1">
                      3. Order swap symmetry
                    </h3>
                    <p className="text-xs text-[#475569] mb-4 leading-relaxed">
                      Swaps candidate position (Model A vs B) to expose whether the judge favors whichever answer appears first.
                    </p>
                    <div className="flex gap-6 text-xs">
                      <div>
                        <span className="text-[#475569] block">Swap consistency</span>
                        <span className="font-bold text-[#101B33] text-sm num">
                          {Math.round(run.audit.order.consistency * 100)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-[#475569] block">Position A win rate</span>
                        <span className="font-bold text-[#101B33] text-sm num">
                          {Math.round(run.audit.order.a_win_rate * 100)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-[#475569] block">Pairwise comparisons</span>
                        <span className="font-bold text-[#101B33] text-sm num">
                          {run.audit.order.pairs}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 border border-[#C9D0DB] bg-white">
                    <h3 className="text-xs font-bold text-[#101B33] mb-1">
                      4. Cross-judge agreement
                    </h3>
                    <p className="text-xs text-[#475569] mb-4 leading-relaxed">
                      Compares Gemma 4 verdicts against an external cloud reference judge.
                    </p>
                    <div className="text-xs text-[#475569]">
                      {run.audit.cross && typeof run.audit.cross === "object" && "agreement" in run.audit.cross ? (
                        <div className="text-[#101B33]">
                          Agreement: <span className="num font-bold">{Math.round(Number((run.audit.cross as { agreement: number }).agreement) * 100)}%</span>
                        </div>
                      ) : (
                        <span>Not run (cross-judge disabled or missing cloud API key).</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-[#475569]">
                Audit will run automatically once scoring completes.
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
