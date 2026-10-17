"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { listRuns } from "../lib/api";
import { RunListItem } from "../lib/types";

export function Sidebar() {
  return (
    <Suspense
      fallback={
        <aside className="w-full md:w-[260px] md:min-w-[260px] md:sticky md:top-0 md:h-screen border-r border-[#1B2A4D] bg-[#101B33] text-[#EEF1F4] flex flex-col shrink-0">
          <div className="p-4 border-b border-[#1B2A4D]">
            <span className="font-bold text-lg tracking-tight text-[#EEF1F4]">
              ModelFit
            </span>
          </div>
        </aside>
      }
    >
      <SidebarContent />
    </Suspense>
  );
}

function formatRelative(iso: string) {
  if (!iso) return "";
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

function SidebarContent() {
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const pathname = usePathname();

  useEffect(() => {
    listRuns()
      .then(setRuns)
      .catch(() => {});
  }, [pathname]);

  const getStatusDot = (status: string) => {
    switch (status) {
      case "done":
        return "bg-[#1F7A5A]";
      case "running":
        return "bg-[#2748F5] animate-pulse";
      case "cancelled":
      case "failed":
        return "bg-[#F4511E]";
      default:
        return "bg-[#C9D0DB]";
    }
  };

  return (
    <aside className="w-full md:w-[260px] md:min-w-[260px] md:sticky md:top-0 md:h-screen border-r border-[#1B2A4D] bg-[#101B33] text-[#EEF1F4] flex flex-col shrink-0 z-30">
      <div className="p-4 border-b border-[#1B2A4D]">
        <div className="flex items-center gap-2 mb-3">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="shrink-0">
            <path d="M3 17H7V12H12V7H17" stroke="#2748F5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="7" r="4" stroke="#1F7A5A" strokeWidth="1.5" fill="none" />
            <circle cx="12" cy="7" r="1.5" fill="#1F7A5A" />
          </svg>
          <Link href="/" className="font-bold text-lg tracking-tight text-[#EEF1F4]">
            ModelFit
          </Link>
        </div>
        <Link
          href="/"
          className="block w-full py-2.5 px-3 bg-[#2748F5] text-white text-xs font-medium rounded-[2px] text-center hover:bg-[#1E3BD0] transition-colors focus:outline-none focus:ring-2 focus:ring-[#DCE3FF]"
        >
          New run
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-3 text-xs font-medium text-[#C9D0DB]/70 border-b border-[#1B2A4D]">
          Previous runs
        </div>
        {runs.length === 0 ? (
          <div className="p-4 text-xs text-[#C9D0DB]/60 leading-relaxed">
            No runs yet. Your first benchmark takes about 10 minutes.
          </div>
        ) : (
          <div className="divide-y divide-[#1B2A4D]">
            {runs.map((r) => {
              const active = pathname === `/run/${r.id}`;
              const title = r.first_prompt
                ? (r.first_prompt.length > 40 ? r.first_prompt.slice(0, 40) + "..." : r.first_prompt)
                : `Benchmark run`;
              const mc = r.models.length;
              const pc = r.prompt_count;
              const rel = formatRelative(r.created_at);
              return (
                <Link
                  key={r.id}
                  href={`/run/${r.id}`}
                  className={`block px-4 py-3 text-xs transition-colors hover:bg-[#1B2A4D]/50 ${
                    active ? "bg-[#1B2A4D] border-l-2 border-[#2748F5]" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-medium text-xs text-[#EEF1F4] truncate">
                      {title}
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-[#C9D0DB]/80 shrink-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${getStatusDot(r.status)}`} />
                      <span>{r.status}</span>
                    </span>
                  </div>
                  <div className="text-[11px] text-[#C9D0DB]/70 flex items-center justify-between gap-1">
                    <span>
                      <span className="num">{mc}</span> {mc === 1 ? "model" : "models"},{" "}
                      <span className="num">{pc}</span> {pc === 1 ? "prompt" : "prompts"}
                    </span>
                    {rel && <span className="shrink-0">{rel}</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
