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

export function IngestRunsTable() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<IngestRun[]>([]);

  useEffect(() => {
    let active = true;

    async function loadRuns() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/ingest/runs", { method: "GET", cache: "no-store" });
        const payload = (await res.json()) as RunsResponse;

        if (!res.ok || !payload.ok) {
          if (!active) return;
          setError(payload.error ?? "Failed to load ingest runs");
          setRuns([]);
          return;
        }

        if (!active) return;
        setRuns(payload.runs ?? []);
      } catch {
        if (!active) return;
        setError("Failed to load ingest runs");
        setRuns([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadRuns();
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
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <tr>
                <td colSpan={6}>No ingest runs found.</td>
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
                </tr>
              ))
            )}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
