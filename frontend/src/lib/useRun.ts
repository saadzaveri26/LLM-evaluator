import { useEffect, useState } from "react";
import { getRun } from "./api";
import { ResponseItem, RunDetail, ScoreItem, SummaryItem } from "./types";

const BASE_URL =
  process.env.NEXT_PUBLIC_API?.replace(/\/$/, "") || "http://localhost:8000/api";

export function useRun(runId: string | null) {
  const [run, setRun] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) {
      setRun(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    getRun(runId)
      .then((data) => {
        if (isMounted) {
          setRun(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || "Failed to load run");
          setLoading(false);
        }
      });

    const es = new EventSource(`${BASE_URL}/runs/${runId}/events`);

    es.addEventListener("phase", (e) => {
      try {
        const d = JSON.parse(e.data);
        setRun((prev) =>
          prev ? { ...prev, phase: d.phase, status: d.phase === "done" ? "done" : prev.status } : null
        );
      } catch {}
    });

    es.addEventListener("response", (e) => {
      try {
        const item: ResponseItem = JSON.parse(e.data);
        setRun((prev) => {
          if (!prev) return null;
          const exists = prev.responses.some((r) => r.id === item.id);
          const nextResponses = exists
            ? prev.responses.map((r) => (r.id === item.id ? item : r))
            : [...prev.responses, item];
          return { ...prev, responses: nextResponses };
        });
      } catch {}
    });

    es.addEventListener("score", (e) => {
      try {
        const item: ScoreItem = JSON.parse(e.data);
        setRun((prev) => {
          if (!prev) return null;
          const exists = prev.scores.some(
            (s) => s.response_id === item.response_id && s.pass === item.pass
          );
          const nextScores = exists
            ? prev.scores.map((s) =>
                s.response_id === item.response_id && s.pass === item.pass
                  ? item
                  : s
              )
            : [...prev.scores, item];
          return { ...prev, scores: nextScores };
        });
      } catch {}
    });

    es.addEventListener("summary", (e) => {
      try {
        const d = JSON.parse(e.data);
        setRun((prev) => (prev ? { ...prev, summary: d.summary as SummaryItem[] } : null));
      } catch {}
    });

    es.addEventListener("audit", (e) => {
      try {
        const d = JSON.parse(e.data);
        setRun((prev) => (prev ? { ...prev, audit: d.audit } : null));
      } catch {}
    });

    es.addEventListener("done", () => {
      setRun((prev) => (prev ? { ...prev, status: "done", phase: "done" } : null));
      es.close();
    });

    es.addEventListener("cancelled", () => {
      setRun((prev) =>
        prev ? { ...prev, status: "cancelled", phase: "cancelled" } : null
      );
      es.close();
    });

    es.addEventListener("error", (e: MessageEvent) => {
      if (e.data) {
        try {
          const d = JSON.parse(e.data);
          if (d.message) setError(d.message);
        } catch {}
      }
    });

    return () => {
      isMounted = false;
      es.close();
    };
  }, [runId]);

  return { run, loading, error, setRun };
}
