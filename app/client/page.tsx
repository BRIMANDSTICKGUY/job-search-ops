"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "../../lib/supabase/browser";

type Lane = "INBOX" | "VERIFIED" | "CLIENT-SENT" | "WATCHLIST" | "REJECTED";
type ClientStatus =
  | "new"
  | "in_progress"
  | "applied"
  | "interviewing"
  | "not_interested";

type Job = {
  id: string;
  title: string | null;
  company: string | null;
  link: string | null;
  lane: Lane | null;
  client_status: ClientStatus | null;
  created_at?: string | null;
  updated_at?: string | null;
  moved_at?: string | null;
  job_assignments?: { id: string }[] | null;
};

type Client = {
  id: string;
  name?: string | null; // if you don’t have this column, it’ll just render the id
  program_start_date?: string | null;
  program_end_date?: string | null;
};

type JobAssignment = {
  id: string; // uuid PK we just added
  job_id: string;
  client_id: string;
  created_at?: string | null;
};

type JobArtifact = {
  job_id: string;
  client_id?: string | null;
  artifact_type?: string | null;
  resume_version_id?: string | null;
  file_url?: string | null;
};

type JdSnapshot = {
  id?: string;
  job_id: string;
  content_text?: string | null;
  source_url?: string | null;
};

const STATUS_OPTIONS: ClientStatus[] = [
  "new",
  "in_progress",
  "applied",
  "interviewing",
  "not_interested",
];

const LANE_OPTIONS: Lane[] = [
  "INBOX",
  "VERIFIED",
  "CLIENT-SENT",
  "WATCHLIST",
  "REJECTED",
];

export default function ClientPage() {
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [assignments, setAssignments] = useState<JobAssignment[]>([]);
  const [artifacts, setArtifacts] = useState<JobArtifact[]>([]);
  const [jdSnapshots, setJdSnapshots] = useState<JdSnapshot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendingMoveByJobId, setPendingMoveByJobId] = useState<
    Record<string, boolean>
  >({});

  // per-job dropdown selection (temporary UI state)
  const [selectedClientByJob, setSelectedClientByJob] = useState<
    Record<string, string>
  >({});
  const [showJdInputByJobId, setShowJdInputByJobId] = useState<
    Record<string, boolean>
  >({});
  const [jdTextByJobId, setJdTextByJobId] = useState<Record<string, string>>({});

  const rowsFound = jobs.length;

  const clientsById = useMemo(() => {
    const map = new Map<string, Client>();
    for (const c of clients) map.set(c.id, c);
    return map;
  }, [clients]);

  const assignmentsByJobId = useMemo(() => {
    const map = new Map<string, JobAssignment[]>();
    for (const a of assignments) {
      const arr = map.get(a.job_id) ?? [];
      arr.push(a);
      map.set(a.job_id, arr);
    }
    return map;
  }, [assignments]);

  const artifactsByJobId = useMemo(() => {
    const map = new Map<string, JobArtifact[]>();
    for (const a of artifacts) {
      const arr = map.get(a.job_id) ?? [];
      arr.push(a);
      map.set(a.job_id, arr);
    }
    return map;
  }, [artifacts]);

  const jdSnapshotsByJobId = useMemo(() => {
    const map = new Map<string, JdSnapshot[]>();
    for (const s of jdSnapshots) {
      const arr = map.get(s.job_id) ?? [];
      arr.push(s);
      map.set(s.job_id, arr);
    }
    return map;
  }, [jdSnapshots]);

  async function loadAll() {
    setLoading(true);
    setError(null);

    // 1) Jobs
    const { data: jobsData, error: jobsErr } = await getSupabaseBrowser()
      .from("jobs")
      .select(
        "id,title,company,link,lane,client_status,created_at,updated_at,moved_at,job_assignments(id)"
      )
      .order("created_at", { ascending: false });

    if (jobsErr) {
      setError(`Jobs load failed: ${jobsErr.message}`);
      setLoading(false);
      return;
    }

    // 2) Clients (we try name, but if it doesn’t exist, Supabase will error — we handle fallback)
    let clientsData: Client[] = [];
    {
  const { data, error } = await getSupabaseBrowser()
        .from("clients")
        .select("id,name,program_start_date,program_end_date")
        .order("id", { ascending: true });

      if (error) {
        // Fallback if your clients table doesn’t have "name" yet
        const { data: data2, error: error2 } = await getSupabaseBrowser()
          .from("clients")
          .select("id,program_start_date,program_end_date")
          .order("id", { ascending: true });

        if (error2) {
          setError(`Clients load failed: ${error2.message}`);
          setLoading(false);
          return;
        }
        clientsData = (data2 ?? []) as Client[];
      } else {
        clientsData = (data ?? []) as Client[];
      }
    }

    // 3) Assignments (this MUST include id)
    const { data: asnData, error: asnErr } = await getSupabaseBrowser()
      .from("job_assignments")
      .select("id,job_id,client_id,created_at")
      .order("created_at", { ascending: false });

    if (asnErr) {
      setError(`Assignments load failed: ${asnErr.message}`);
      setLoading(false);
      return;
    }

    // 4) Job artifacts (read-only)
    const { data: artData, error: artErr } = await getSupabaseBrowser()
      .from("job_artifacts")
      .select("job_id,artifact_type,file_url");

    if (artErr) {
      setError(`Artifacts load failed: ${artErr.message}`);
      setLoading(false);
      return;
    }

    // 5) JD snapshots (read-only)
    const { data: jdData, error: jdErr } = await getSupabaseBrowser()
      .from("jd_snapshots")
      .select("id,job_id,content_text,source_url");

    if (jdErr) {
      setError(`JD snapshots load failed: ${jdErr.message}`);
      setLoading(false);
      return;
    }

    setJobs((jobsData ?? []) as Job[]);
    setClients(clientsData);
    setAssignments((asnData ?? []) as JobAssignment[]);
    setArtifacts((artData ?? []) as JobArtifact[]);
    setJdSnapshots((jdData ?? []) as JdSnapshot[]);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Realtime -> "jobs-updated" event -> reload Supabase data for /client.
    const handleJobsUpdated = () => {
      setPendingMoveByJobId({});
      void loadAll();
    };
    window.addEventListener("jobs-updated", handleJobsUpdated);
    return () => {
      window.removeEventListener("jobs-updated", handleJobsUpdated);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function updateJobLane(jobId: string, lane: Lane) {
    // optimistic
    setPendingMoveByJobId((prev) => ({ ...prev, [jobId]: true }));
    setJobs((prev) =>
      prev.map((j) =>
        j.id === jobId
          ? { ...j, lane, moved_at: new Date().toISOString() }
          : j
      )
    );

    const { error } = await getSupabaseBrowser()
      .from("jobs")
      .update({ lane, moved_at: new Date().toISOString() })
      .eq("id", jobId);

    if (error) {
      setError(`Lane update failed: ${error.message}`);
      // reload to correct UI if optimistic diverged
      loadAll();
    } else {
      setPendingMoveByJobId((prev) => {
        const next = { ...prev };
        delete next[jobId];
        return next;
      });
    }
  }

  async function updateClientStatus(jobId: string, client_status: ClientStatus) {
    // optimistic
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, client_status } : j))
    );

    const { error } = await getSupabaseBrowser()
      .from("jobs")
      .update({ client_status, updated_at: new Date().toISOString() })
      .eq("id", jobId);

    if (error) {
      setError(`Status update failed: ${error.message}`);
      loadAll();
    }
  }

  async function assignClientToJob(jobId: string) {
    const clientId = selectedClientByJob[jobId];
    if (!clientId) return;

    // prevent duplicate click in UI (unique index will also enforce this)
    const existing = (assignmentsByJobId.get(jobId) ?? []).some(
      (a) => a.client_id === clientId
    );
    if (existing) {
      setError("That client is already assigned to this job.");
      return;
    }

    // optimistic insert placeholder (we’ll replace with real row after insert)
    const optimisticId = `optimistic_${jobId}_${clientId}`;
    const optimisticRow: JobAssignment = {
      id: optimisticId,
      job_id: jobId,
      client_id: clientId,
      created_at: new Date().toISOString(),
    };
    setAssignments((prev) => [optimisticRow, ...prev]);

    const { data, error } = await getSupabaseBrowser()
      .from("job_assignments")
      .insert({ job_id: jobId, client_id: clientId })
      .select("id,job_id,client_id,created_at")
      .single();

    if (error) {
      // remove optimistic row
      setAssignments((prev) => prev.filter((a) => a.id !== optimisticId));

      // if it’s a unique constraint, keep message clean
      const msg =
        error.message?.toLowerCase().includes("duplicate") ||
        error.message?.toLowerCase().includes("unique")
          ? "Duplicate blocked (good): that job/client pair already exists."
          : error.message;

      setError(`Assign failed: ${msg}`);
      return;
    }

    // swap optimistic row with real row (id uuid)
    setAssignments((prev) =>
      prev.map((a) => (a.id === optimisticId ? (data as JobAssignment) : a))
    );
  }

  async function unassignByAssignmentId(assignmentId: string) {
    // optimistic delete
    const snapshot = assignments;
    setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));

    const { error } = await getSupabaseBrowser()
      .from("job_assignments")
      .delete()
      .eq("id", assignmentId);

    if (error) {
      setError(`Unassign failed: ${error.message}`);
      setAssignments(snapshot); // rollback
    }
  }

  async function attachAppliedResume(
    job: Job,
    clientId: string,
    file: File
  ) {
    const timestamp = Date.now();
    const path = `${clientId}/${job.id}/${timestamp}`;

    const { error: uploadErr } = await getSupabaseBrowser().storage
      .from("applied-resumes")
      .upload(path, file, { upsert: false });

    if (uploadErr) {
      setError(`Upload failed: ${uploadErr.message}`);
      return;
    }

    const { data: publicUrlData } = getSupabaseBrowser().storage
      .from("applied-resumes")
      .getPublicUrl(path);

    const fileUrl = publicUrlData?.publicUrl ?? "";
    const dateLabel = new Date().toLocaleDateString();
    const title = job.title ?? "Untitled";

    const { data: resumeData, error: resumeErr } = await getSupabaseBrowser()
      .from("resume_versions")
      .insert({
        client_id: clientId,
        label: `Applied – ${title} – ${dateLabel}`,
        is_locked: true,
        file_url: fileUrl,
      })
      .select("id")
      .single();

    if (resumeErr) {
      setError(`Resume version insert failed: ${resumeErr.message}`);
      return;
    }

    const { error: artifactErr } = await getSupabaseBrowser()
      .from("job_artifacts")
      .insert({
        job_id: job.id,
        client_id: clientId,
        artifact_type: "applied_resume",
        resume_version_id: resumeData?.id,
        file_url: fileUrl,
      });

    if (artifactErr) {
      const msg =
        artifactErr.message?.toLowerCase().includes("duplicate") ||
        artifactErr.message?.toLowerCase().includes("unique")
          ? "Applied resume already attached for this job."
          : artifactErr.message;
      setError(`Artifact insert failed: ${msg}`);
      return;
    }

    setArtifacts((prev) => [
      {
        job_id: job.id,
        client_id: clientId,
        artifact_type: "applied_resume",
        resume_version_id: resumeData?.id,
        file_url: fileUrl,
        jd_snapshot_id: null,
      },
      ...prev,
    ]);
  }

  const primaryClient = clients[0];
  const programStart = primaryClient?.program_start_date ?? null;
  const programEnd = primaryClient?.program_end_date ?? null;
  const daysRemaining =
    programEnd && !Number.isNaN(new Date(programEnd).getTime())
      ? Math.max(
          0,
          Math.ceil(
            (new Date(programEnd).getTime() - new Date().getTime()) /
              (1000 * 60 * 60 * 24)
          )
        )
      : null;

  return (
    <main
      style={{
        padding: 24,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
        maxWidth: 920,
        margin: "0 auto",
      }}
    >
      <header
        style={{
          marginBottom: 18,
          background: "rgba(37, 99, 235, 0.08)",
          padding: "14px 16px",
          borderBottom: "2px solid #2563EB",
        }}
      >
        <div style={{ fontSize: 12, letterSpacing: 0.5, opacity: 0.6, marginBottom: 6 }}>
          Shared Status View
        </div>
        <h1 style={{ fontSize: 30, marginBottom: 6 }}>Your Applications</h1>
        <div style={{ fontSize: 14, opacity: 0.75, lineHeight: 1.4 }}>
          This page shows the jobs you’ve applied to and where each one currently stands.
          <br />
          <br />
          Your coach may move jobs between lanes to organize your search.
          <br />
          Your status reflects your real-world progress with each application.
        </div>
      </header>

      <div style={{ marginBottom: 14, fontSize: 12, opacity: 0.6 }}>
        Diagnostics: {loading ? "Loading…" : `Rows found: ${rowsFound}`}
      </div>

      <div style={{ marginBottom: 14, fontSize: 12, opacity: 0.7 }}>
        <div style={{ marginBottom: 4 }}>Program Timeline</div>
        <div>Program Start Date: {programStart ?? "—"}</div>
        <div>Program End Date: {programEnd ?? "—"}</div>
        <div>Days Remaining: {programEnd ? daysRemaining ?? "—" : "—"}</div>
      </div>

      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            border: "1px solid #e11d48",
            borderRadius: 8,
            background: "#fff1f2",
          }}
        >
          <strong style={{ color: "#be123c" }}>Error:</strong>{" "}
          <span style={{ color: "#be123c" }}>{error}</span>
          <div style={{ marginTop: 8 }}>
            <button
              onClick={() => setError(null)}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #be123c",
                background: "white",
                cursor: "pointer",
              }}
            >
              Dismiss
            </button>{" "}
            <button
              onClick={() => loadAll()}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #111827",
                background: "white",
                cursor: "pointer",
                marginLeft: 8,
              }}
            >
              Reload
            </button>
          </div>
        </div>
      )}

      {!loading && jobs.length === 0 && (
        <div style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 8 }}>
          No jobs yet.
        </div>
      )}

      <section style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 6 }}>Applications</div>
      </section>

      <ul style={{ listStyle: "disc", paddingLeft: 22 }}>
        {jobs.map((job) => {
          const jobAssignments = assignmentsByJobId.get(job.id) ?? [];
          const jobArtifacts = artifactsByJobId.get(job.id) ?? [];
          const jobJdSnapshots = jdSnapshotsByJobId.get(job.id) ?? [];
          const selectedClient = selectedClientByJob[job.id] ?? "";
          const isPending = Boolean(pendingMoveByJobId[job.id]);
          const hasAppliedResume = jobArtifacts.some(
            (a) => a.artifact_type === "applied_resume"
          );
          const hasJdSnapshot = jobJdSnapshots.length > 0;
          const isInterviewing = (job.client_status ?? "new") === "interviewing";
          const appliedResumeUrl =
            jobArtifacts.find(
              (a) => a.artifact_type === "applied_resume" && a.file_url
            )?.file_url ?? null;
          const jdSnapshotText = jobJdSnapshots[0]?.content_text ?? "—";
          const assignedClientId = jobAssignments[0]?.client_id ?? null;
          const isAssignedByCoach = (job.job_assignments?.length ?? 0) > 0;
          const fileInputId = `applied-resume-${job.id}`;
          const jdText = jdTextByJobId[job.id] ?? "";
          const showJdInput = Boolean(showJdInputByJobId[job.id]);

          return (
            <li
              key={job.id}
              style={{
                marginBottom: 18,
                opacity: isPending ? 0.75 : 1,
                borderBottom: "1px solid rgba(37, 99, 235, 0.45)",
                paddingBottom: 14,
              }}
            >
              <div style={{ marginBottom: 6 }}>
                <strong>{job.title ?? "(Untitled)"}</strong>{" "}
                {isAssignedByCoach && (
                  <span
                    style={{
                      display: "inline-block",
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: 0.2,
                      marginRight: 6,
                      padding: "2px 8px",
                      borderRadius: 999,
                      border: "1px solid #bfdbfe",
                      background: "#eff6ff",
                      color: "#1d4ed8",
                      verticalAlign: "middle",
                    }}
                  >
                    Assigned by coach
                  </span>
                )}
                — {job.company ?? "(No company)"}{" "}
                — <span>Lane:</span> <strong>{job.lane ?? "INBOX"}</strong>{" "}
                — <span>Status:</span>{" "}
                <strong>{job.client_status ?? "new"}</strong>
                {isPending && (
                  <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.7 }}>
                    Saving…
                  </span>
                )}
              </div>

              {/* Lane buttons */}
              <div>Lane = where your coach has placed this job to organize your search.</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                {LANE_OPTIONS.map((lane) => {
                  const active = (job.lane ?? "INBOX") === lane;
                  return (
                    <button
                      key={lane}
                      onClick={() => updateJobLane(job.id, lane)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 10,
                        border: "1px solid #d1d5db",
                        background: active ? "#111827" : "white",
                        color: active ? "white" : "#111827",
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      {lane}
                    </button>
                  );
                })}
              </div>

              {/* Status buttons */}
              <div>Status = your progress with this application.</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                {STATUS_OPTIONS.map((s) => {
                  const active = (job.client_status ?? "new") === s;
                  return (
                    <button
                      key={s}
                      data-status={s}
                      aria-pressed={active}
                      onClick={() => updateClientStatus(job.id, s)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 10,
                        border: "1px solid #d1d5db",
                        background: active ? "#111827" : "white",
                        color: active ? "white" : "#111827",
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>

              {false && (
                <>
                  {/* Assignment UI */}
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      flexWrap: "wrap",
                      marginBottom: 8,
                    }}
                  >
                    <label style={{ fontSize: 13, opacity: 0.8 }}>
                      Assign client:
                    </label>

                    <select
                      value={selectedClient}
                      onChange={(e) =>
                        setSelectedClientByJob((prev) => ({
                          ...prev,
                          [job.id]: e.target.value,
                        }))
                      }
                      style={{
                        padding: "6px 10px",
                        borderRadius: 10,
                        border: "1px solid #d1d5db",
                        background: "white",
                        minWidth: 240,
                      }}
                    >
                      <option value="">Select a client…</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name ? `${c.name} (${c.id})` : c.id}
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={() => assignClientToJob(job.id)}
                      disabled={!selectedClient}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 10,
                        border: "1px solid #111827",
                        background: selectedClient ? "#111827" : "#9ca3af",
                        color: "white",
                        cursor: selectedClient ? "pointer" : "not-allowed",
                        fontSize: 13,
                      }}
                    >
                      Assign
                    </button>
                  </div>

                  {/* Assigned clients list (UNASSIGN BY assignment.id) */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {jobAssignments.length === 0 ? (
                      <span style={{ fontSize: 13, opacity: 0.7 }}>
                        No clients assigned.
                      </span>
                    ) : (
                      jobAssignments.map((a) => {
                        const c = clientsById.get(a.client_id);
                        const label = c?.name ? c.name : a.client_id;

                        return (
                          <span
                            key={a.id}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 8,
                              border: "1px solid #d1d5db",
                              borderRadius: 999,
                              padding: "6px 10px",
                              fontSize: 13,
                              background: "white",
                            }}
                          >
                            <strong>{label}</strong>
                            <button
                              onClick={() => unassignByAssignmentId(a.id)}
                              style={{
                                padding: "2px 8px",
                                borderRadius: 999,
                                border: "1px solid #ef4444",
                                background: "white",
                                color: "#ef4444",
                                cursor: "pointer",
                                fontSize: 12,
                              }}
                              title="Unassign"
                            >
                              Unassign
                            </button>
                          </span>
                        );
                      })
                    )}
                  </div>
                </>
              )}

              <div style={{ marginTop: 10, fontSize: 12, color: "rgba(37, 99, 235, 0.6)" }}>
                <div>Artifacts</div>
                <div>Applied Resume: {hasAppliedResume ? "attached" : "none"}</div>
                <div>JD Snapshot: {hasJdSnapshot ? "captured" : "none"}</div>
                {!hasAppliedResume && (
                  <div style={{ marginTop: 6 }}>
                    <input
                      id={fileInputId}
                      type="file"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (!assignedClientId) {
                          setError("Attach failed: no assigned client for this job.");
                          return;
                        }
                        void attachAppliedResume(job, assignedClientId, file);
                      }}
                    />
                    <button
                      onClick={() =>
                        (document.getElementById(fileInputId) as HTMLInputElement | null)?.click()
                      }
                      style={{
                        padding: "4px 8px",
                        borderRadius: 8,
                        border: "1px solid #d1d5db",
                        background: "white",
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      Attach Applied Resume
                    </button>
                  </div>
                )}
                {!hasJdSnapshot && (
                  <div style={{ marginTop: 6 }}>
                    {showJdInput && (
                      <textarea
                        value={jdText}
                        onChange={(e) =>
                          setJdTextByJobId((prev) => ({
                            ...prev,
                            [job.id]: e.target.value,
                          }))
                        }
                        rows={3}
                        style={{
                          width: "100%",
                          border: "1px solid #d1d5db",
                          borderRadius: 8,
                          padding: "6px 8px",
                          fontSize: 12,
                          marginBottom: 6,
                        }}
                        placeholder="Paste job description..."
                      />
                    )}
                    <button
                      onClick={async () => {
                        if (!showJdInput) {
                          setShowJdInputByJobId((prev) => ({
                            ...prev,
                            [job.id]: true,
                          }));
                          return;
                        }
                        if (!jdText.trim()) return;
                        const { data, error } = await getSupabaseBrowser()
                          .from("jd_snapshots")
                          .insert({
                            job_id: job.id,
                            content_text: jdText,
                            source_url: null,
                          })
                          .select("id,job_id,content_text,source_url")
                          .single();
                        if (error || !data) return;
                        setJdSnapshots((prev) => [data as JdSnapshot, ...prev]);
                        setShowJdInputByJobId((prev) => {
                          const next = { ...prev };
                          delete next[job.id];
                          return next;
                        });
                        setJdTextByJobId((prev) => {
                          const next = { ...prev };
                          delete next[job.id];
                          return next;
                        });
                      }}
                      style={{
                        padding: "4px 8px",
                        borderRadius: 8,
                        border: "1px solid #d1d5db",
                        background: "white",
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      Capture JD Snapshot
                    </button>
                  </div>
                )}
              </div>

              {isInterviewing && (
                <div style={{ marginTop: 10, fontSize: 12, color: "#475569" }}>
                  <div style={{ marginBottom: 4 }}>Interview Prep Context</div>
                  <div>
                    Applied Resume:{" "}
                    {appliedResumeUrl ? (
                      <a href={appliedResumeUrl} target="_blank" rel="noreferrer">
                        view/download
                      </a>
                    ) : (
                      "—"
                    )}
                  </div>
                  <div style={{ whiteSpace: "pre-wrap" }}>
                    Job Description: {jdSnapshotText}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
