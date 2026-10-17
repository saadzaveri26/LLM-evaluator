"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "../components/Sidebar";
import { createRun, getModels } from "../lib/api";
import { ModelsResponse, PromptItem } from "../lib/types";

const PRESETS = {
  coding: [
    { text: "Write a TypeScript function that deduplicates an array of objects by a given key." },
    { text: "Implement a Python decorator that retries an async function up to 3 times on exception with exponential backoff." },
    { text: "Explain why a SQL query with WHERE id IN (...) might be slow on a large table and how to optimize it." },
    { text: "Write a bash command pipeline to find the top 5 largest directories in the current filesystem." },
    { text: "Review this snippet for potential memory leaks: useEffect(() => { const sub = source.subscribe(); }, []);" },
  ],
  summaries: [
    { text: "Summarize the architectural differences between monolithic and microservice architectures in under 100 words." },
    { text: "Rewrite this customer apology email to be empathetic, professional, and clear about the fix timeline: 'We had a bug and servers went down yesterday.'" },
    { text: "Extract the key action items and owners from this meeting transcript snippet: 'Sarah will finalize the API spec by Tuesday; Dave needs to provision the staging cluster.'" },
    { text: "Explain the concept of quantum superposition to a high school student using an intuitive analogy." },
    { text: "Condense this release note paragraph into three bullet points highlighting breaking changes." },
  ],
  reasoning: [
    { text: "If a train travels 60 mph for 2 hours and then 45 mph for 3 hours, what is its average speed for the entire journey? Show your calculation." },
    { text: "Solve this riddle: I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?" },
    { text: "A store offers a 20% discount on an item, followed by an additional 10% coupon off the discounted price. What is the total percentage saved?" },
    { text: "There are 5 red balls and 3 green balls in a bag. What is the probability of drawing two consecutive red balls without replacement?" },
    { text: "Analyze whether the following argument is logically sound: 'All birds have feathers. Ostriches have feathers. Therefore, ostriches can fly.'" },
  ],
};

export default function NewRunPage() {
  const router = useRouter();
  const [modelData, setModelData] = useState<ModelsResponse | null>(null);
  const [prompts, setPrompts] = useState<PromptItem[]>([
    { text: "Write a function in Python that checks if a string is a palindrome." },
  ]);
  const [selectedLocal, setSelectedLocal] = useState<string[]>([]);
  const [selectedCloud, setSelectedCloud] = useState<{ provider: string; model: string }[]>([]);
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
  };

  const handleRemovePrompt = (idx: number) => {
    if (prompts.length <= 1) return;
    setPrompts(prompts.filter((_, i) => i !== idx));
  };

  const handleUpdatePrompt = (idx: number, text: string) => {
    const next = [...prompts];
    next[idx] = { ...next[idx], text };
    setPrompts(next);
  };

  const handleApplyPreset = (key: keyof typeof PRESETS) => {
    setPrompts(PRESETS[key].slice(0, 20));
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
    }
  };

  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (!content) return;
      const lines = content.split("\n").filter((l) => l.trim().length > 0);
      const parsed: PromptItem[] = [];
      for (const line of lines) {
        const parts = line.split(",");
        const promptText = parts[0]?.trim();
        const refText = parts[1]?.trim() || null;
        if (promptText) {
          parsed.push({ text: promptText, reference: refText });
        }
      }
      if (parsed.length > 0) {
        setPrompts(parsed.slice(0, 20));
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

  let submitDisabled = false;
  let disabledReason = "";

  if (!modelData?.judge.available) {
    submitDisabled = true;
    disabledReason = "Gemma 4 is not installed. Run ollama pull gemma4.";
  } else if (validPrompts.length === 0) {
    submitDisabled = true;
    disabledReason = "Add at least one prompt.";
  } else if (totalSelectedModels === 0) {
    submitDisabled = true;
    disabledReason = "Select at least one candidate model.";
  }

  const handleStartBenchmark = async () => {
    if (submitDisabled || submitting) return;
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
      const msg = err instanceof Error ? err.message : "Failed to start benchmark";
      setError(msg);
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-[#EEF1F4]">
      <Sidebar />

      <main className="flex-1 p-6 max-w-4xl">
        <div className="border-b border-[#C9D0DB] pb-4 mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-[#101B33]">
            New benchmark run
          </h1>
          <p className="text-xs text-[#5C677D] mt-1">
            Measure local candidates on your own prompts, find the good-enough pick, and audit the AI judge.
          </p>
        </div>

        {error && (
          <div className="p-3 mb-6 bg-[#F4511E]/10 border border-[#F4511E]/30 text-xs text-[#F4511E] rounded-[2px]">
            {error}
          </div>
        )}

        <section className="bg-[#F7F9FB] border border-[#C9D0DB] p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-[#101B33]">Prompt set</h2>
              <p className="text-xs text-[#5C677D]">
                Add up to 20 prompts. You can also import CSV or pick a starter set.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#5C677D]">Presets:</span>
              <button
                type="button"
                onClick={() => handleApplyPreset("coding")}
                className="px-2 py-0.5 text-xs bg-[#EEF1F4] border border-[#C9D0DB] rounded-[2px] text-[#101B33] hover:bg-[#E2E6EB]"
              >
                Everyday coding
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset("summaries")}
                className="px-2 py-0.5 text-xs bg-[#EEF1F4] border border-[#C9D0DB] rounded-[2px] text-[#101B33] hover:bg-[#E2E6EB]"
              >
                Summaries & rewriting
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset("reasoning")}
                className="px-2 py-0.5 text-xs bg-[#EEF1F4] border border-[#C9D0DB] rounded-[2px] text-[#101B33] hover:bg-[#E2E6EB]"
              >
                Reasoning & maths
              </button>
            </div>
          </div>

          <div className="space-y-3 mb-4">
            {prompts.map((p, idx) => (
              <div key={idx} className="flex gap-2 items-start">
                <span className="text-xs font-mono text-[#5C677D] pt-2 w-6 text-right shrink-0">
                  {idx + 1}.
                </span>
                <textarea
                  value={p.text}
                  onChange={(e) => handleUpdatePrompt(idx, e.target.value)}
                  placeholder="Enter evaluation prompt..."
                  rows={2}
                  className="flex-1 text-xs p-2.5 bg-white border border-[#C9D0DB] rounded-[2px] text-[#101B33] focus:outline-none focus:ring-1 focus:ring-[#2748F5]"
                />
                <button
                  type="button"
                  onClick={() => handleRemovePrompt(idx)}
                  disabled={prompts.length <= 1}
                  className="px-2 py-2 text-xs text-[#5C677D] hover:text-[#F4511E] disabled:opacity-30"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#C9D0DB]">
            <button
              type="button"
              onClick={handleAddPrompt}
              disabled={prompts.length >= 20}
              className="px-3 py-1 text-xs bg-[#EEF1F4] border border-[#C9D0DB] rounded-[2px] text-[#101B33] hover:bg-[#E2E6EB] disabled:opacity-40"
            >
              + Add prompt ({prompts.length}/20)
            </button>

            <div className="flex items-center gap-3">
              <label className="text-xs text-[#2748F5] cursor-pointer hover:underline">
                Import CSV
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleCsvImport}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#C9D0DB]">
            <div className="text-xs font-medium text-[#101B33] mb-1">
              Bulk paste (split on blank lines)
            </div>
            <div className="flex gap-2">
              <textarea
                value={pasteBox}
                onChange={(e) => setPasteBox(e.target.value)}
                placeholder="Paste multiple prompts separated by blank lines..."
                rows={2}
                className="flex-1 text-xs p-2 bg-white border border-[#C9D0DB] rounded-[2px] text-[#101B33]"
              />
              <button
                type="button"
                onClick={handlePasteSplit}
                className="px-3 py-1 text-xs bg-[#EEF1F4] border border-[#C9D0DB] rounded-[2px] text-[#101B33] self-end hover:bg-[#E2E6EB]"
              >
                Split & load
              </button>
            </div>
          </div>
        </section>

        <section className="bg-[#F7F9FB] border border-[#C9D0DB] p-5 mb-6">
          <h2 className="text-sm font-semibold text-[#101B33] mb-1">
            Candidate models ({totalSelectedModels}/8 selected)
          </h2>
          <p className="text-xs text-[#5C677D] mb-4">
            Select local models from Ollama to run sequentially.
          </p>

          <div className="divide-y divide-[#C9D0DB] border border-[#C9D0DB] bg-white rounded-[2px] mb-4">
            {modelData?.local.length === 0 ? (
              <div className="p-3 text-xs text-[#5C677D]">
                No local models found in Ollama. Run ollama pull to get started.
              </div>
            ) : (
              modelData?.local.map((m) => {
                const selected = selectedLocal.includes(m.name);
                return (
                  <label
                    key={m.name}
                    className="flex items-center justify-between p-3 text-xs cursor-pointer hover:bg-[#EEF1F4]"
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleLocalModel(m.name)}
                        className="rounded-[2px] border-[#C9D0DB] text-[#2748F5]"
                      />
                      <span className="font-medium text-[#101B33]">{m.name}</span>
                    </div>
                    <span className="font-mono text-[#5C677D]">
                      {m.size_gb.toFixed(1)} GB
                    </span>
                  </label>
                );
              })
            )}
          </div>

          {modelData && modelData.cloud.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-[#5C677D] mb-2 uppercase tracking-wide">
                Reference only (Cloud models)
              </h3>
              <div className="divide-y divide-[#C9D0DB] border border-[#C9D0DB] bg-white rounded-[2px]">
                {modelData.cloud.map((c) => {
                  const selected = selectedCloud.some(
                    (s) => s.provider === c.provider && s.model === c.name
                  );
                  return (
                    <label
                      key={`${c.provider}-${c.name}`}
                      className="flex items-center justify-between p-3 text-xs cursor-pointer hover:bg-[#EEF1F4]"
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleCloudModel(c.provider, c.name)}
                          className="rounded-[2px] border-[#C9D0DB] text-[#2748F5]"
                        />
                        <span className="font-medium text-[#101B33]">{c.name}</span>
                      </div>
                      <span className="text-[11px] px-1.5 py-0.5 bg-[#EEF1F4] border border-[#C9D0DB] text-[#5C677D]">
                        {c.provider} reference
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <section className="bg-[#F7F9FB] border border-[#C9D0DB] p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-[#101B33]">Judge configuration</h2>
              <p className="text-xs text-[#5C677D]">
                Scores each answer twice to measure how steady the judge is.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-[#101B33]">Two judge passes</label>
              <input
                type="checkbox"
                checked={passes === 2}
                onChange={(e) => setPasses(e.target.checked ? 2 : 1)}
                className="rounded-[2px] border-[#C9D0DB] text-[#2748F5]"
              />
            </div>
          </div>

          <div className="border-t border-[#C9D0DB] pt-4">
            <h3 className="text-xs font-semibold text-[#101B33] mb-3">
              Initial priorities for recommendation
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span>Quality</span>
                  <span className="font-mono">{qualityW}/10</span>
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
                  <span>Speed</span>
                  <span className="font-mono">{speedW}/10</span>
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
                  <span>Memory</span>
                  <span className="font-mono">{memoryW}/10</span>
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
        </section>

        <div className="flex items-center justify-between pt-2">
          {disabledReason && (
            <span className="text-xs text-[#F4511E] font-medium">
              {disabledReason}
            </span>
          )}
          <button
            type="button"
            disabled={submitDisabled || submitting}
            onClick={handleStartBenchmark}
            className="ml-auto px-6 py-2.5 bg-[#2748F5] text-white text-xs font-semibold rounded-[2px] hover:bg-[#1E3BD0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Starting..." : "Start benchmark"}
          </button>
        </div>
      </main>
    </div>
  );
}
