"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "../components/Sidebar";
import { createRun, getModels } from "../lib/api";
import { ModelsResponse, PromptItem } from "../lib/types";

const PRESETS = {
  coding: {
    title: "Code and debugging",
    desc: "5 prompts, functions and bugs",
    items: [
      { text: "Write a TypeScript function that deduplicates an array of objects by a given key." },
      { text: "Implement a Python decorator that retries an async function up to 3 times on exception with exponential backoff." },
      { text: "Explain why a SQL query with WHERE id IN (...) might be slow on a large table and how to optimize it." },
      { text: "Write a bash command pipeline to find the top 5 largest directories in the current filesystem." },
      { text: "Review this snippet for potential memory leaks: useEffect(() => { const sub = source.subscribe(); }, []);" },
    ],
  },
  summaries: {
    title: "Extraction and summary",
    desc: "5 prompts, structure and brevity",
    items: [
      { text: "Summarize the architectural differences between monolithic and microservice architectures in under 100 words." },
      { text: "Rewrite this customer apology email to be empathetic, professional, and clear about the fix timeline: 'We had a bug and servers went down yesterday.'" },
      { text: "Extract the key action items and owners from this meeting transcript snippet: 'Sarah will finalize the API spec by Tuesday; Dave needs to provision the staging cluster.'" },
      { text: "Explain the concept of quantum superposition to a high school student using an intuitive analogy." },
      { text: "Condense this release note paragraph into three bullet points highlighting breaking changes." },
    ],
  },
  reasoning: {
    title: "Math and logic",
    desc: "5 prompts, steps and calculations",
    items: [
      { text: "If a train travels 60 mph for 2 hours and then 45 mph for 3 hours, what is its average speed for the entire journey? Show your calculation." },
      { text: "Solve this riddle: I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?" },
      { text: "A store offers a 20% discount on an item, followed by an additional 10% coupon off the discounted price. What is the total percentage saved?" },
      { text: "There are 5 red balls and 3 green balls in a bag. What is the probability of drawing two consecutive red balls without replacement?" },
      { text: "Analyze whether the following argument is logically sound: 'All birds have feathers. Ostriches have feathers. Therefore, ostriches can fly.'" },
    ],
  },
};

const NON_CHAT = ["guard", "safeguard", "moderation", "whisper", "tts", "playai", "orpheus", "embed", "transcribe", "rerank"];

export default function NewRunPage() {
  const router = useRouter();
  const [modelData, setModelData] = useState<ModelsResponse | null>(null);
  const [prompts, setPrompts] = useState<PromptItem[]>([
    { text: "Write a function in Python that checks if a string is a palindrome." },
  ]);
  const [selectedLocal, setSelectedLocal] = useState<string[]>([]);
  const [selectedCloud, setSelectedCloud] = useState<{ provider: string; model: string }[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<keyof typeof PRESETS | null>(null);
  const [cloudOpen, setCloudOpen] = useState<boolean>(false);
  const [cloudSearch, setCloudSearch] = useState<string>("");
  const [passes, setPasses] = useState<number>(2);
  const [pasteBox, setPasteBox] = useState<string>("");
  const [qualityW, setQualityW] = useState<number>(5);
  const [speedW, setSpeedW] = useState<number>(5);
  const [memoryW, setMemoryW] = useState<number>(5);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getModels()
      .then((data) => {
        setModelData(data);
        if (data.local.length > 0) {
          setSelectedLocal(data.local.slice(0, 4).map((m) => m.name));
        }
      })
      .catch(() => {
        setError("Ollama is not running. Start it with ollama serve, then try again.");
      });
  }, []);

  const handleAddPrompt = () => {
    if (prompts.length >= 20) return;
    setPrompts([...prompts, { text: "" }]);
    setSelectedPreset(null);
  };

  const handleRemovePrompt = (idx: number) => {
    if (prompts.length <= 1) return;
    setPrompts(prompts.filter((_, i) => i !== idx));
    setSelectedPreset(null);
  };

  const handleUpdatePrompt = (idx: number, text: string) => {
    const next = [...prompts];
    next[idx] = { ...next[idx], text };
    setPrompts(next);
    setSelectedPreset(null);
  };

  const handleApplyPreset = (key: keyof typeof PRESETS) => {
    setSelectedPreset(key);
    setPrompts(PRESETS[key].items.slice(0, 20));
  };

  const handlePasteSplit = () => {
    if (!pasteBox.trim()) return;
    const items = pasteBox
      .split(/\n\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (items.length > 0) {
      setPrompts(items.slice(0, 20).map((t) => ({ text: t })));
      setPasteBox("");
      setSelectedPreset(null);
    }
  };

  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (!content) return;
      const lines = content
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      const parsed: PromptItem[] = [];
      for (const line of lines) {
        if (line.toLowerCase().startsWith("prompt") && parsed.length === 0) continue;
        if (line.includes(",")) {
          const parts = line.split(",");
          parsed.push({ text: parts[0].trim(), reference: parts[1]?.trim() });
        } else {
          parsed.push({ text: line });
        }
        if (parsed.length >= 20) break;
      }
      if (parsed.length > 0) {
        setPrompts(parsed);
        setSelectedPreset(null);
      }
    };
    reader.readAsText(file);
  };

  const toggleLocalModel = (name: string) => {
    if (selectedLocal.includes(name)) {
      setSelectedLocal(selectedLocal.filter((m) => m !== name));
    } else {
      if (selectedLocal.length + selectedCloud.length >= 8) return;
      setSelectedLocal([...selectedLocal, name]);
    }
  };

  const toggleCloudModel = (provider: string, model: string) => {
    const exists = selectedCloud.some((c) => c.provider === provider && c.model === model);
    if (exists) {
      setSelectedCloud(selectedCloud.filter((c) => !(c.provider === provider && c.model === model)));
    } else {
      if (selectedLocal.length + selectedCloud.length >= 8) return;
      setSelectedCloud([...selectedCloud, { provider, model }]);
    }
  };

  const totalSelectedModels = selectedLocal.length + selectedCloud.length;
  const validPrompts = prompts.filter((p) => p.text.trim().length > 0);

  const calculateEstimate = () => {
    let loadSec = 0;
    let infSec = 0;
    for (const name of selectedLocal) {
      const m = modelData?.local.find((x) => x.name === name);
      const gb = m?.size_gb || 4;
      loadSec += 5 * gb;
      infSec += validPrompts.length * 20 * Math.max(0.5, gb / 4);
    }
    infSec += selectedCloud.length * validPrompts.length * 20;
    const judgeSec = validPrompts.length * totalSelectedModels * passes * 6;
    const auditSec = 30;
    const totalSec = loadSec + infSec + judgeSec + auditSec;
    const mins = Math.max(1, Math.round(totalSec / 60));
    if (mins <= 10) {
      return `about ${mins} ${mins === 1 ? "minute" : "minutes"}`;
    }
    const low = Math.max(10, Math.floor(mins * 0.85));
    const high = Math.ceil(mins * 1.15);
    return `about ${low} to ${high} minutes`;
  };

  const estimateText = calculateEstimate();

  const totalLocalGb = selectedLocal.reduce((acc, name) => {
    const m = modelData?.local.find((x) => x.name === name);
    return acc + (m?.size_gb || 0);
  }, 0);

  const judgeName = modelData?.judge.model || "";
  const isJudgeSelected = selectedLocal.includes(judgeName);

  let disabledReason = "";
  if (!modelData?.judge.available) {
    disabledReason = `Judge model ${judgeName || "gemma4"} is missing. Run ollama pull ${judgeName || "gemma4"}`;
  } else if (validPrompts.length === 0) {
    disabledReason = "Enter at least one prompt";
  } else if (totalSelectedModels === 0) {
    disabledReason = "Select at least one candidate model";
  }

  const handleStartRun = async () => {
    if (disabledReason || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await createRun({
        prompts: validPrompts,
        models: selectedLocal,
        cloud: selectedCloud,
        passes,
        temperature: 0.2,
      });
      router.push(`/run/${res.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create run";
      setError(msg);
      setSubmitting(false);
    }
  };

  const filteredCloud = (modelData?.cloud || []).filter((c) => {
    const id = c.name.toLowerCase();
    if (NON_CHAT.some((f) => id.includes(f))) return false;
    if (cloudSearch.trim()) {
      const q = cloudSearch.toLowerCase();
      return c.name.toLowerCase().includes(q) || c.provider.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-grid">
      <Sidebar />

      <main className="flex-1 p-6 md:p-10 max-w-[1120px] pb-32">
        {error && (
          <div className="mb-6 p-4 bg-[#FFE3D9] border border-[#F4511E] text-xs text-[#F4511E] rounded-[2px] flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-xs font-bold hover:opacity-75 focus:outline-none"
            >
              ✕
            </button>
          </div>
        )}

        <header className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-6 pb-8 border-b border-[#C9D0DB]">
          <div className="max-w-[640px]">
            <h1 className="text-3xl sm:text-4xl md:text-[56px] font-bold text-[#101B33] tracking-tight leading-[1.08] mb-3">
              Which local model fits your prompts?
            </h1>
            <p className="text-base sm:text-lg text-[#475569] leading-relaxed">
              Find the smallest local model that is good enough for your custom prompts, and audit the AI judge that says so.
            </p>
          </div>

          <div className="shrink-0 flex justify-center w-full md:w-auto">
            <svg
              viewBox="0 0 320 180"
              className="w-full max-w-[320px] h-auto bg-white border border-[#C9D0DB] select-none"
              fill="none"
            >
              <line x1="45" y1="20" x2="45" y2="145" stroke="#C9D0DB" strokeWidth="1" />
              <line x1="45" y1="145" x2="305" y2="145" stroke="#C9D0DB" strokeWidth="1" />
              <line x1="45" y1="105" x2="305" y2="105" stroke="#C9D0DB" strokeWidth="1" strokeDasharray="3 3" opacity="0.45" />
              <line x1="45" y1="65" x2="305" y2="65" stroke="#C9D0DB" strokeWidth="1" strokeDasharray="3 3" opacity="0.45" />

              <text x="45" y="16" fontSize="13" fontWeight="600" fill="#475569">Quality</text>
              <text x="215" y="166" fontSize="13" fontWeight="600" fill="#475569">Memory in GB</text>

              <path d="M 75 120 H 135 V 90 H 200 V 60 H 290" stroke="#101B33" strokeWidth="1.5" fill="none" />

              <circle cx="75" cy="120" r="3.5" fill="#101B33" />
              <text x="75" y="140" fontSize="13" fill="#475569" textAnchor="middle">0.5b</text>

              <circle cx="135" cy="90" r="4.5" fill="#1F7A5A" />
              <circle cx="135" cy="90" r="10" stroke="#1F7A5A" strokeWidth="2" fill="none" className="animate-ring" />
              <text x="135" y="72" fontSize="13" fontWeight="600" fill="#1F7A5A" textAnchor="middle">good enough</text>

              <circle cx="200" cy="60" r="3.5" fill="#101B33" />
              <text x="200" y="48" fontSize="13" fill="#475569" textAnchor="middle">3b</text>

              <circle cx="245" cy="80" r="3.5" fill="#C9D0DB" />
              <text x="245" y="104" fontSize="13" fill="#475569" textAnchor="middle">7b</text>

              <circle cx="290" cy="60" r="3.5" fill="#101B33" />
              <text x="290" y="48" fontSize="13" fill="#475569" textAnchor="middle">14b</text>
            </svg>
          </div>
        </header>

        <div className="space-y-10">
          <section className="bg-white border-t-[3px] border-t-[#101B33] border-x border-b border-[#C9D0DB] p-8 shadow-sm">
            <div className="flex items-baseline gap-3 mb-6">
              <span className="text-[40px] font-bold text-[#2748F5] leading-none num">1</span>
              <div>
                <h2 className="text-lg font-bold text-[#101B33]">Prompts</h2>
                <p className="text-xs text-[#475569]">
                  Test your actual workload. Up to 20 prompts, 4000 characters each.
                </p>
              </div>
            </div>

            <div className="mb-6">
              <div className="text-xs font-medium text-[#101B33] mb-2">Preset workloads</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((key) => {
                  const p = PRESETS[key];
                  const active = selectedPreset === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleApplyPreset(key)}
                      className={`p-3 rounded-[2px] text-left transition-all border group focus:outline-none focus:ring-2 focus:ring-[#2748F5] active:scale-[0.98] ${
                        active
                          ? "bg-[#DCE3FF] border-[#2748F5]"
                          : "bg-white border-[#C9D0DB] hover:border-[#2748F5]/60 hover:bg-[#F9FAFC] active:bg-[#EEF1F4]"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1 text-[#101B33]">
                        {key === "coding" && (
                          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="shrink-0">
                            <path d="M5 4L2 8L5 12M11 4L14 8L11 12M9 3L7 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                        {key === "summaries" && (
                          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="shrink-0">
                            <path d="M3 4H13M3 8H13M3 12H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                        )}
                        {key === "reasoning" && (
                          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="shrink-0">
                            <path d="M12 4H4L8.5 8L4 12H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                        <span className="text-xs font-medium leading-none">{p.title}</span>
                      </div>
                      <div className="text-[11px] text-[#475569]">
                        {p.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3 mb-4">
              {prompts.map((p, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <span className="w-6 pt-2.5 text-right text-xs text-[#475569] shrink-0 num">
                    {idx + 1}
                  </span>
                  <div className="flex-1 flex flex-col gap-1.5">
                    <textarea
                      value={p.text}
                      onChange={(e) => handleUpdatePrompt(idx, e.target.value)}
                      placeholder={`Enter test prompt ${idx + 1}...`}
                      rows={2}
                      maxLength={4000}
                      className="w-full text-xs p-3 bg-white border border-[#C9D0DB] rounded-[2px] text-[#101B33] focus:outline-none focus:ring-2 focus:ring-[#2748F5] resize-y"
                    />
                    <input
                      type="text"
                      value={p.reference || ""}
                      onChange={(e) => {
                        const next = [...prompts];
                        next[idx] = { ...next[idx], reference: e.target.value };
                        setPrompts(next);
                      }}
                      placeholder="Optional reference answer..."
                      className="w-full text-xs px-3 py-1.5 bg-white/70 border border-[#C9D0DB] rounded-[2px] text-[#475569] focus:outline-none focus:ring-1 focus:ring-[#2748F5]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemovePrompt(idx)}
                    disabled={prompts.length <= 1}
                    className="p-2 text-xs text-[#475569] hover:text-[#F4511E] disabled:opacity-20 shrink-0"
                    title="Remove prompt"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-[#C9D0DB]">
              <button
                type="button"
                onClick={handleAddPrompt}
                disabled={prompts.length >= 20}
                className="px-3 py-1.5 text-xs bg-[#EEF1F4] border border-[#C9D0DB] rounded-[2px] text-[#101B33] hover:bg-[#E2E6EB] disabled:opacity-40 font-medium"
              >
                + Add prompt (<span className="num">{prompts.length}</span>/20)
              </button>

              <label className="text-xs text-[#2748F5] cursor-pointer hover:underline font-medium">
                Import CSV
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleCsvImport}
                  className="hidden"
                />
              </label>
            </div>

            <details className="mt-4 pt-3 border-t border-[#C9D0DB] text-xs">
              <summary className="font-medium text-[#101B33] cursor-pointer hover:text-[#2748F5] select-none">
                Paste many prompts
              </summary>
              <div className="mt-3 flex gap-2">
                <textarea
                  value={pasteBox}
                  onChange={(e) => setPasteBox(e.target.value)}
                  placeholder="Paste multiple prompts separated by blank lines..."
                  rows={3}
                  className="flex-1 text-xs p-3 bg-white border border-[#C9D0DB] rounded-[2px] text-[#101B33] focus:outline-none focus:ring-2 focus:ring-[#2748F5]"
                />
                <button
                  type="button"
                  onClick={handlePasteSplit}
                  className="px-4 py-2 text-xs bg-[#EEF1F4] border border-[#C9D0DB] rounded-[2px] text-[#101B33] self-end hover:bg-[#E2E6EB] font-medium"
                >
                  Split and load
                </button>
              </div>
            </details>
          </section>

          <section className="bg-white border-t-[3px] border-t-[#101B33] border-x border-b border-[#C9D0DB] p-8 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 sm:gap-4 mb-6">
              <div className="flex items-baseline gap-3">
                <span className="text-[40px] font-bold text-[#2748F5] leading-none num">2</span>
                <div>
                  <h2 className="text-lg font-bold text-[#101B33]">Models</h2>
                  <p className="text-xs text-[#475569]">
                    Select candidate models to run through Ollama.
                  </p>
                </div>
              </div>

              <div className="text-xs text-[#475569] shrink-0 whitespace-nowrap">
                <span className="num font-semibold text-[#101B33]">{totalSelectedModels}</span> of <span className="num">8</span> selected
              </div>
            </div>

            {isJudgeSelected && (
              <div className="mb-4 p-3 bg-[#FFE3D9] border border-[#F4511E] text-xs text-[#F4511E] rounded-[2px] flex items-center gap-2">
                <span className="font-bold">Self-judged warning:</span>
                <span>The candidate model matches the active judge ({judgeName}). Evaluating a model with itself can distort quality scores.</span>
              </div>
            )}

            <div className="space-y-2 mb-6">
              {modelData?.local.length === 0 ? (
                <div className="p-4 bg-white border border-[#C9D0DB] text-xs text-[#475569]">
                  No local models found in Ollama. Run ollama pull to get started.
                </div>
              ) : (
                modelData?.local.map((m) => {
                  const selected = selectedLocal.includes(m.name);
                  const isJudge = m.name === judgeName;
                  return (
                    <div
                      key={m.name}
                      onClick={() => toggleLocalModel(m.name)}
                      className={`flex items-center justify-between p-3 text-xs cursor-pointer border transition-colors ${
                        selected
                          ? "bg-[#DCE3FF] border-[#2748F5] border-l-4"
                          : "bg-white border-[#C9D0DB] border-l-4 border-l-transparent hover:bg-[#EEF1F4]"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => {}}
                          className="rounded-[2px] border-[#C9D0DB] text-[#2748F5]"
                        />
                        <span className="font-medium text-[#101B33]">{m.name}</span>
                        {isJudge && (
                          <span className="px-1.5 py-0.5 text-[10px] bg-[#FFE3D9] text-[#F4511E] font-medium rounded-[2px]">
                            Judge
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="w-24 h-1.5 bg-[#C9D0DB] rounded-[1px] overflow-hidden hidden sm:block">
                          <div
                            className="h-full bg-[#101B33]"
                            style={{ width: `${Math.min(100, (m.size_gb / 16) * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-[#101B33] w-20 text-right">
                          <span className="num font-semibold">{m.size_gb.toFixed(1)}</span> GB
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-4 border-t border-[#C9D0DB]">
              {selectedCloud.length > 0 && (
                <div className="mb-3">
                  <div className="text-[11px] font-semibold text-[#475569] mb-1.5">
                    Selected cloud reference models:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedCloud.map((c) => (
                      <span
                        key={`${c.provider}-${c.model}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#EEF1F4] border border-[#C9D0DB] rounded-[2px] text-xs text-[#101B33]"
                      >
                        <span>{c.model}</span>
                        <span className="text-[10px] px-1 py-0.5 bg-[#C9D0DB]/60 rounded text-[#475569]">
                          {c.provider}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleCloudModel(c.provider, c.model)}
                          className="text-[#475569] hover:text-[#F4511E] ml-1 font-bold focus:outline-none"
                          title="Remove reference model"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => setCloudOpen(!cloudOpen)}
                className="text-xs font-semibold text-[#2748F5] hover:underline flex items-center gap-1.5 focus:outline-none"
              >
                <span>{cloudOpen ? "▾" : "▸"}</span>
                <span>Add a cloud reference model (optional)</span>
                <span className="text-[11px] text-[#475569] font-normal">(Reference only)</span>
              </button>

              {cloudOpen && (
                <div className="mt-3 space-y-2">
                  <input
                    type="text"
                    value={cloudSearch}
                    onChange={(e) => setCloudSearch(e.target.value)}
                    placeholder="Search cloud reference models..."
                    className="w-full text-xs p-2.5 bg-white border border-[#C9D0DB] rounded-[2px] text-[#101B33] focus:outline-none focus:ring-2 focus:ring-[#2748F5]"
                  />

                  <div className="max-h-[300px] overflow-y-auto divide-y divide-[#C9D0DB] border border-[#C9D0DB] bg-white rounded-[2px]">
                    {filteredCloud.length === 0 ? (
                      <div className="p-3 text-xs text-[#475569] text-center">
                        No matching cloud reference models found.
                      </div>
                    ) : (
                      filteredCloud.map((c) => {
                        const selected = selectedCloud.some(
                          (s) => s.provider === c.provider && s.model === c.name
                        );
                        return (
                          <div
                            key={`${c.provider}-${c.name}`}
                            onClick={() => toggleCloudModel(c.provider, c.name)}
                            className={`flex items-center justify-between p-2.5 text-xs cursor-pointer transition-colors ${
                              selected ? "bg-[#DCE3FF]" : "hover:bg-[#EEF1F4]"
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => {}}
                                className="rounded-[2px] border-[#C9D0DB] text-[#2748F5]"
                              />
                              <span className="font-medium text-[#101B33]">{c.name}</span>
                            </div>
                            <span className="text-[10px] px-1.5 py-0.5 bg-[#EEF1F4] border border-[#C9D0DB] rounded-[2px] text-[#475569]">
                              {c.provider}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="bg-white border-t-[3px] border-t-[#101B33] border-x border-b border-[#C9D0DB] p-8 shadow-sm">
            <div className="flex items-baseline gap-3 mb-6">
              <span className="text-[40px] font-bold text-[#2748F5] leading-none num">3</span>
              <div>
                <h2 className="text-lg font-bold text-[#101B33]">Priorities</h2>
                <p className="text-xs text-[#475569]">
                  Set your trade-off weights for the recommender. You can also change these later on the plot.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div>
                <div className="flex justify-between items-center text-xs mb-1.5">
                  <span className="font-medium text-[#101B33]">Quality</span>
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
                <div className="text-[11px] text-[#475569] mt-1.5">
                  Higher means quality matters more
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center text-xs mb-1.5">
                  <span className="font-medium text-[#101B33]">Speed</span>
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
                <div className="text-[11px] text-[#475569] mt-1.5">
                  Higher means generation speed matters more
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center text-xs mb-1.5">
                  <span className="font-medium text-[#101B33]">Memory</span>
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
                <div className="text-[11px] text-[#475569] mt-1.5">
                  Higher means small RAM footprint matters more
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-[#C9D0DB] flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-xs font-medium text-[#101B33]">Retest passes</div>
                <div className="text-[11px] text-[#475569]">
                  Scores each answer twice to measure how steady the judge is.
                </div>
              </div>

              <div className="relative flex p-1 bg-[#EEF1F4] border border-[#C9D0DB] rounded-[2px] w-48">
                <div
                  className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-[#2748F5] rounded-[2px] transition-transform duration-200 ease-out"
                  style={{
                    transform: passes === 1 ? "translateX(0)" : "translateX(calc(100% + 4px))",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setPasses(1)}
                  className={`relative z-10 flex-1 py-1 text-xs font-medium text-center transition-colors ${
                    passes === 1 ? "text-white" : "text-[#101B33] hover:text-[#2748F5]"
                  }`}
                >
                  <span className="num">1</span> pass
                </button>
                <button
                  type="button"
                  onClick={() => setPasses(2)}
                  className={`relative z-10 flex-1 py-1 text-xs font-medium text-center transition-colors ${
                    passes === 2 ? "text-white" : "text-[#101B33] hover:text-[#2748F5]"
                  }`}
                >
                  <span className="num">2</span> passes
                </button>
              </div>
            </div>
          </section>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-[#C9D0DB] p-4 -mx-6 md:-mx-10 mt-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 z-20 shadow-md">
          <div className="text-xs text-[#101B33]">
            <span className="num font-semibold">{totalSelectedModels}</span> {totalSelectedModels === 1 ? "model" : "models"},{" "}
            <span className="num font-semibold">{validPrompts.length}</span> {validPrompts.length === 1 ? "prompt" : "prompts"},{" "}
            {estimateText} · about <span className="num font-semibold">{totalLocalGb.toFixed(1)}</span> GB loaded one at a time
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
            {disabledReason && (
              <span className="text-xs font-medium text-[#F4511E] max-w-md text-left sm:text-right">
                {disabledReason}
              </span>
            )}

            <button
              type="button"
              onClick={handleStartRun}
              disabled={Boolean(disabledReason) || submitting}
              className="h-12 px-8 bg-[#2748F5] text-white text-sm font-medium rounded-[2px] hover:bg-[#1E3BD0] active:bg-[#152BA8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-[#DCE3FF] w-full sm:w-auto text-center"
            >
              {submitting ? "Starting..." : "Start benchmark"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
