"use client";

import { useState } from "react";

type ScrapeResponse = {
  ok?: boolean;
  ingested?: number;
  total?: number;
  inserted?: number;
  fetched?: number;
  duplicates?: number;
  errors?: Array<{ source_id?: string; message?: string }>;
  fetch_errors?: Array<{ source_type?: string; source_url?: string | null; message?: string }>;
  error?: string;
};

export function RunGreenhouseScrapeButton() {
  const [stubLoading, setStubLoading] = useState(false);
  const [liveLoading, setLiveLoading] = useState(false);
  const [message, setMessage] = useState<string>("");

  async function runGreenhouseStub() {
    setStubLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/coach/ingest/run", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          mode: "stub",
          source_detail: "coach_manual_trigger",
        }),
      });

      const data = (await res.json()) as ScrapeResponse;

      if (!res.ok || !data.ok) {
        setMessage(data.error ?? "Scrape failed");
        return;
      }

      setMessage(`Scrape complete. Ingested ${data.ingested ?? 0} of ${data.total ?? 0} jobs`);
    } catch {
      setMessage("Unexpected error while running scrape");
    } finally {
      setStubLoading(false);
    }
  }

  async function runLiveSources() {
    setLiveLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/coach/ingest/run", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          mode: "live",
          source_detail: "coach_manual_trigger",
        }),
      });

      const data = (await res.json()) as ScrapeResponse;

      if (!res.ok || !data.ok) {
        setMessage(data.error ?? "Live ingest failed");
        return;
      }

      const inserted = data.inserted ?? 0;
      const fetched = data.fetched ?? 0;
      const duplicates = data.duplicates ?? 0;
      const fetchErrorCount = data.fetch_errors?.length ?? 0;
      const sourceErrorCount = data.errors?.length ?? 0;
      setMessage(
        `Live ingest complete. Fetched ${fetched} jobs, inserted ${inserted} new job(s), skipped ${duplicates} duplicate(s).${fetchErrorCount || sourceErrorCount ? ` ${fetchErrorCount} fetch issue(s), ${sourceErrorCount} source error(s).` : ""}`
      );
    } catch {
      setMessage("Unexpected error while running live ingest");
    } finally {
      setLiveLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button type="button" onClick={runLiveSources} disabled={liveLoading || stubLoading}>
          {liveLoading ? "Running Live Ingest..." : "Run Live Source Ingest"}
        </button>
        <button type="button" onClick={runGreenhouseStub} disabled={stubLoading || liveLoading}>
          {stubLoading ? "Running Stub..." : "Run Greenhouse Stub"}
        </button>
      </div>
      {message ? <p style={{ margin: 0, fontSize: 13 }}>{message}</p> : null}
    </div>
  );
}
