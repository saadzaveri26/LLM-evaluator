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
        <aside className="w-full md:w-60 md:min-w-[240px] md:h-screen border-r border-[#C9D0DB] bg-[#F7F9FB] flex flex-col shrink-0">
          <div className="p-4 border-b border-[#C9D0DB]">
            <span className="font-bold text-lg tracking-tight text-[#101B33]">
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

function SidebarContent() {
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const pathname = usePathname();

  useEffect(() => {
    listRuns()
      .then(setRuns)
      .catch(() => {});
  }, [pathname]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "done":
        return "bg-[#1F7A5A]/15 text-[#1F7A5A] border-[#1F7A5A]/30";
      case "running":
        return "bg-[#2748F5]/15 text-[#2748F5] border-[#2748F5]/30";
      case "cancelled":
      case "failed":
        return "bg-[#F4511E]/15 text-[#F4511E] border-[#F4511E]/30";
      default:
        return "bg-[#C9D0DB]/40 text-[#101B33] border-[#C9D0DB]";
    }
  };

  return (
    <aside className="w-full md:w-60 md:min-w-[240px] md:h-screen border-r border-[#C9D0DB] bg-[#F7F9FB] flex flex-col shrink-0">
      <div className="p-4 border-b border-[#C9D0DB] flex items-center justify-between">
        <div>
          <Link href="/" className="font-bold text-lg tracking-tight text-[#101B33]">
            ModelFit
          </Link>
          <div className="text-xs text-[#5C677D]">Local LLM benchmark sheet</div>
        </div>
        <Link
          href="/"
          className="px-2.5 py-1 text-xs bg-[#2748F5] text-white rounded-[2px] font-medium hover:bg-[#1E3BD0] transition-colors"
        >
          New run
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-3 py-2 text-[11px] font-semibold text-[#5C677D] border-b border-[#C9D0DB]/60">
          Previous runs
        </div>
        {runs.length === 0 ? (
          <div className="p-4 text-xs text-[#5C677D]">No runs yet.</div>
        ) : (
          <div className="divide-y divide-[#C9D0DB]">
            {runs.map((r) => {
              const active = pathname === `/run/${r.id}`;
              return (
                <Link
                  key={r.id}
                  href={`/run/${r.id}`}
                  className={`block p-3 text-xs transition-colors hover:bg-[#EEF1F4] ${
                    active ? "bg-[#EEF1F4] border-l-2 border-[#2748F5]" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-mono text-[11px] font-medium text-[#101B33]">
                      #{r.id}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full border ${getStatusColor(
                        r.status
                      )}`}
                    >
                      {r.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#5C677D] truncate">
                    {r.models.length} models · {r.prompt_count} prompts
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
