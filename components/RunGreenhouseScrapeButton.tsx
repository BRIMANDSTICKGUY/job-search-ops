"use client";

import { useState } from "react";

type ScrapeResponse = {
  ok?: boolean;
  ingested?: number;
  total?: number;
  inserted?: number;
  fetched?: number;
  duplicates?: number;
  source_summaries?: Array<{
    source_id?: string;
    source_type?: string;
    company_name?: string | null;
    client_id?: string | null;
    fetched?: number;
    inserted?: number;
    duplicates?: number;
    archived?: number;
    skipped_no_profiles?: boolean;
  }>;
  errors?: Array<{ source_id?: string; message?: string }>;
  fetch_errors?: Array<{ source_type?: string; source_url?: string | null; message?: string }>;
  error?: string;
};

export function RunGreenhouseScrapeButton() {
  const [stubLoading, setStubLoading] = useState(false);
  const [liveLoading, setLiveLoading] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [sourceSummaries, setSourceSummaries] = useState<NonNullable<ScrapeResponse["source_summaries"]>>([]);

  async function runGreenhouseStub() {
    setStubLoading(true);
    setMessage("");
    setSourceSummaries([]);

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
    setSourceSummaries([]);

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
      const archived = (data.source_summaries ?? []).reduce(
        (sum, summary) => sum + (summary.archived ?? 0),
        0
      );
      setSourceSummaries(data.source_summaries ?? []);
      setMessage(
        `Live ingest complete. Fetched ${fetched} jobs, inserted ${inserted} new job(s), skipped ${duplicates} duplicate(s), archived ${archived} stale job(s).${fetchErrorCount || sourceErrorCount ? ` ${fetchErrorCount} fetch issue(s), ${sourceErrorCount} source error(s).` : ""}`
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
      {sourceSummaries.length ? (
        <div style={{ display: "grid", gap: 8 }}>
          {sourceSummaries.map((summary) => {
            const label = summary.company_name?.trim() || summary.source_type || summary.source_id || "source";
            return (
              <div
                key={`${summary.source_id ?? label}`}
                style={{
                  display: "grid",
                  gap: 4,
                  padding: "10px 12px",
                  border: "1px solid #dbe4f0",
                  borderRadius: 12,
                  background: "#f8fafc",
                  fontSize: 13,
                }}
              >
                <strong style={{ color: "#0f172a" }}>
                  {label} {summary.source_type ? `(${summary.source_type})` : ""}
                </strong>
                <span style={{ color: "#526071" }}>
                  Fetched {summary.fetched ?? 0}, inserted {summary.inserted ?? 0}, duplicates {summary.duplicates ?? 0}, archived {summary.archived ?? 0}
                  {summary.skipped_no_profiles ? ", skipped because the client has no job profile" : ""}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
