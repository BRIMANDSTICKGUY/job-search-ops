"use client";

import { useEffect, useState } from "react";

type IngestRun = {
  id: string;
  source: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  job_count: number;
  error_message: string | null;
};

type RunsResponse = {
  ok: boolean;
  runs?: IngestRun[];
  error?: string;
};

type RetryResponse = {
  ok: boolean;
  error?: string;
  new_run_id?: string;
  total?: number;
  ingested?: number;
  duplicates?: number;
};

type RetryIngestRunButtonProps = {
  runId: string;
  onDone?: () => Promise<void> | void;
};

export function RetryIngestRunButton({ runId, onDone }: RetryIngestRunButtonProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onRetry() {
    setIsRetrying(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch(`/api/ingest/runs/${encodeURIComponent(runId)}/retry`, {
        method: "POST",
      });
      const payload = (await res.json()) as RetryResponse;

      if (!res.ok || !payload.ok) {
        setError(payload.error ?? "Retry failed");
        return;
      }

      setMessage(
        `Retry complete. Ingested ${payload.ingested ?? 0} of ${payload.total ?? 0} jobs.`
      );
      if (onDone) {
        await onDone();
      }
    } catch {
      setError("Retry failed");
    } finally {
      setIsRetrying(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={onRetry} disabled={isRetrying}>
        {isRetrying ? "Retrying..." : "Retry"}
      </button>
      {message ? <div style={{ fontSize: 12, color: "#15803d" }}>{message}</div> : null}
      {error ? <div style={{ fontSize: 12, color: "#b91c1c" }}>{error}</div> : null}
    </div>
  );
}

export function IngestRunsTable() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<IngestRun[]>([]);

  async function loadRuns() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ingest/runs", { method: "GET", cache: "no-store" });
      const payload = (await res.json()) as RunsResponse;

      if (!res.ok || !payload.ok) {
        setError(payload.error ?? "Failed to load ingest runs");
        setRuns([]);
        return;
      }

      setRuns(payload.runs ?? []);
    } catch {
      setError("Failed to load ingest runs");
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    void (async () => {
      if (!active) return;
      await loadRuns();
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <section style={{ marginBottom: 32 }}>
      <h2>Recent Ingest Runs</h2>
      {loading ? <p>Loading ingest runs...</p> : null}
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      {!loading && !error ? (
        <table>
          <thead>
            <tr>
              <th>Source</th>
              <th>Status</th>
              <th>Started At</th>
              <th>Finished At</th>
              <th>Job Count</th>
              <th>Error</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <tr>
                <td colSpan={7}>No ingest runs found.</td>
              </tr>
            ) : (
              runs.map((run) => (
                <tr key={run.id}>
                  <td>{run.source}</td>
                  <td>{run.status}</td>
                  <td>{run.started_at}</td>
                  <td>{run.finished_at ?? "—"}</td>
                  <td>{run.job_count}</td>
                  <td>{run.error_message ?? "—"}</td>
                  <td>
                    {run.status === "failed" ? (
                      <RetryIngestRunButton runId={run.id} onDone={loadRuns} />
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
