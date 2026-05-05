"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type ClientJob = {
  id: string;
  title: string | null;
  company: string | null;
  location: string | null;
  created_at: string | null;
  client_status: string | null;
  link: string | null;
};

interface Props {
  jobs: ClientJob[];
}

export function ClientJobsTable({ jobs }: Props) {
  const [items, setItems] = useState<ClientJob[]>(jobs);
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItems(jobs);
  }, [jobs]);

  async function updateStatus(jobId: string, nextStatus: string) {
    if (!nextStatus) return;

    setPendingJobId(jobId);
    setError(null);

    try {
      const {
        data: { session },
      } = await getSupabaseBrowser().auth.getSession();

      const accessToken = session?.access_token;
      if (!accessToken) {
        setError("Session expired. Sign in again.");
        return;
      }

      const response = await fetch("/api/client/job-action", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ job_id: jobId, action: nextStatus }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Failed to update job status");
        return;
      }

      setItems((current) =>
        current.map((job) =>
          job.id === jobId ? { ...job, client_status: nextStatus } : job
        )
      );
    } catch {
      setError("Failed to update job status");
    } finally {
      setPendingJobId(null);
    }
  }

  if (items.length === 0) {
    return <p>No jobs available yet.</p>;
  }

  return (
    <section style={{ display: "grid", gap: 14 }}>
      {error ? (
        <p style={{ margin: 0, color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 14, padding: "12px 14px", fontSize: 14 }}>
          {error}
        </p>
      ) : null}

      {items.map((job) => (
        <article key={job.id} style={{ background: "#fff", border: "1px solid #dbe4f0", borderRadius: 20, boxShadow: "0 16px 40px rgba(15, 23, 42, 0.06)", padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 20, letterSpacing: "-0.02em", color: "#0f172a" }}>{job.title ?? "Untitled role"}</h2>
              <p style={{ margin: "4px 0 0", color: "#334155", fontSize: 15, fontWeight: 600 }}>{job.company ?? "Unknown company"}</p>
            </div>
            <span style={{ display: "inline-flex", alignItems: "center", padding: "6px 12px", borderRadius: 999, background: "#eaf2ff", color: "#1d4ed8", fontSize: 12, fontWeight: 800, textTransform: "capitalize", height: "fit-content" }}>
              {job.client_status ?? "new"}
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#64748b", marginBottom: 4 }}>Location</div>
              <div style={{ color: "#0f172a", fontSize: 14 }}>{job.location ?? "Location not listed"}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#64748b", marginBottom: 4 }}>Assigned Feed</div>
              <div style={{ color: "#0f172a", fontSize: 14 }}>{job.created_at ? new Date(job.created_at).toLocaleDateString() : "Recently assigned"}</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {job.link ? (
              <a href={job.link} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "10px 14px", borderRadius: 12, background: "#0f172a", color: "#fff", fontSize: 14, fontWeight: 700, textDecoration: "none" }}>
                View job details
              </a>
            ) : null}

            <select
              aria-label={`Update status for ${job.title ?? "job"}`}
              value=""
              onChange={(event) => void updateStatus(job.id, event.target.value)}
              disabled={pendingJobId === job.id}
              style={{ minHeight: 40, border: "1px solid #cbd5e1", borderRadius: 12, background: "#fff", color: "#0f172a", padding: "8px 10px", fontSize: 14 }}
            >
              <option value="">Update status</option>
              <option value="viewed">Viewed</option>
              <option value="saved">Saved</option>
              <option value="applied">Applied</option>
              <option value="interview">Interview</option>
              <option value="offer">Offer</option>
              <option value="rejected">Rejected</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </div>
        </article>
      ))}
    </section>
  );
}
