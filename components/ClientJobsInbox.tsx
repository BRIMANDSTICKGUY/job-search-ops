"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type ClientJob = {
  id: string;
  title: string | null;
  company: string | null;
  location: string | null;
  link: string | null;
  created_at: string | null;
  client_status: string | null;
};

type ClientJobsResponse = {
  ok: boolean;
  jobs?: ClientJob[];
  error?: string;
};

export default function ClientJobsInbox() {
  const router = useRouter();
  const [jobs, setJobs] = useState<ClientJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          router.replace("/login");
          return;
        }

        const res = await fetch("/api/client/jobs", {
          method: "GET",
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
          cache: "no-store",
        });

        const data = (await res.json()) as ClientJobsResponse;

        if (!res.ok || !data.ok) {
          if (!active) return;
          setError(data.error ?? "Failed to load jobs");
          return;
        }

        if (!active) return;
        setJobs(data.jobs ?? []);
      } catch {
        if (!active) return;
        setError("Failed to load jobs");
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
  }, [router]);

  return (
    <div style={{ padding: "40px" }}>
      <h1 style={{ fontSize: "28px", marginBottom: "20px" }}>Job Inbox</h1>

      {loading ? <p>Loading...</p> : null}
      {!loading && error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      {!loading && !error && jobs.length === 0 ? <p>No jobs available yet.</p> : null}

      {!loading && !error && jobs.length > 0 ? (
        <table border={1} cellPadding={10} style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th>Job Title</th>
              <th>Company</th>
              <th>Found At</th>
              <th>Status</th>
              <th>Link</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td>{job.title ?? "—"}</td>
                <td>{job.company ?? "—"}</td>
                <td>{job.created_at ?? "—"}</td>
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
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}