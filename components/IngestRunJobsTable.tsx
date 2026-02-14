"use client";

import { useEffect, useState } from "react";

type RunJob = {
  id: string;
  title: string;
  company: string;
  lane: string;
  client_status: string | null;
  link: string | null;
};

type JobsResponse = {
  ok: boolean;
  jobs?: RunJob[];
  error?: string;
};

type IngestRunJobsTableProps = {
  runId: string;
};

export function IngestRunJobsTable({ runId }: IngestRunJobsTableProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<RunJob[]>([]);

  useEffect(() => {
    let active = true;

    async function loadJobs() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/ingest/runs/${encodeURIComponent(runId)}/jobs`, {
          method: "GET",
          cache: "no-store",
        });
        const payload = (await res.json()) as JobsResponse;

        if (!res.ok || !payload.ok) {
          if (!active) return;
          setError(payload.error ?? "Failed to load jobs for run");
          setJobs([]);
          return;
        }

        if (!active) return;
        setJobs(payload.jobs ?? []);
      } catch {
        if (!active) return;
        setError("Failed to load jobs for run");
        setJobs([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadJobs();

    return () => {
      active = false;
    };
  }, [runId]);

  return (
    <div style={{ marginTop: 12 }}>
      {loading ? <p>Loading jobs for run...</p> : null}
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      {!loading && !error ? (
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Company</th>
              <th>Lane</th>
              <th>Client Status</th>
              <th>Link</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={5}>No jobs for this run.</td>
              </tr>
            ) : (
              jobs.map((job) => (
                <tr key={job.id}>
                  <td>{job.title}</td>
                  <td>{job.company}</td>
                  <td>{job.lane}</td>
                  <td>{job.client_status ?? "—"}</td>
                  <td>
                    {job.link ? (
                      <a href={job.link} target="_blank" rel="noreferrer">
                        View
                      </a>
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
    </div>
  );
}
