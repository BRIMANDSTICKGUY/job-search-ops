"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type ClientJob = {
  id: string;
  title: string | null;
  company: string | null;
  source: string | null;
  created_at: string | null;
  client_status: string | null;
  link: string | null;
};

type ClientJobsResponse = {
  ok: boolean;
  jobs?: ClientJob[];
  error?: string;
};

export function ClientJobsTable() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<ClientJob[]>([]);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadJobs() {
      setLoading(true);
      setError(null);

      try {
        const {
          data: { session },
        } = await getSupabaseBrowser().auth.getSession();

        const accessToken = session?.access_token;
        if (!accessToken) {
          if (!active) return;
          setError("Unauthorized");
          setJobs([]);
          setAccessToken(null);
          return;
        }
        setAccessToken(accessToken);

        const response = await fetch("/api/client/jobs", {
          method: "GET",
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
          cache: "no-store",
        });

        const payload = (await response.json()) as ClientJobsResponse;

        if (!response.ok || !payload.ok) {
          if (!active) return;
          setError(payload.error ?? "Failed to load jobs");
          setJobs([]);
          return;
        }

        if (!active) return;
        setJobs(payload.jobs ?? []);
      } catch {
        if (!active) return;
        setError("Failed to load jobs");
        setJobs([]);
        setAccessToken(null);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadJobs();

    return () => {
      active = false;
    };
  }, []);

  function postAppliedAction(jobId: string) {
    if (!accessToken) return;

    void fetch("/api/client/job-action", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        job_id: jobId,
        action: "applied",
      }),
    }).catch(() => {});
  }

  if (loading) {
    return <p>Loading jobs...</p>;
  }

  if (error) {
    return <p style={{ color: "#b91c1c" }}>{error}</p>;
  }

  return (
    <section>
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Company</th>
            <th>Source</th>
            <th>Found At</th>
            <th>Status</th>
            <th>Link</th>
          </tr>
        </thead>
        <tbody>
          {jobs.length === 0 ? (
            <tr>
              <td colSpan={6}>No jobs found yet</td>
            </tr>
          ) : (
            jobs.map((job) => (
              <tr key={job.id}>
                <td>{job.title ?? "—"}</td>
                <td>{job.company ?? "—"}</td>
                <td>{job.source ?? "—"}</td>
                <td>{job.created_at ?? "—"}</td>
                <td>{job.client_status ?? "—"}</td>
                <td>
                  {job.link ? (
                    <a
                      href={job.link}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => postAppliedAction(job.id)}
                    >
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
    </section>
  );
}
