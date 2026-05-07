"use client";

import { useEffect, useState } from "react";

const tableWrapStyle: React.CSSProperties = {
  overflowX: "auto",
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  background: "#ffffff",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 720,
  borderCollapse: "collapse",
};

const headerCellStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 14px",
  background: "#f8fafc",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "#526071",
};

const bodyCellStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderTop: "1px solid #e2e8f0",
  fontSize: 14,
  color: "#0f172a",
  verticalAlign: "top",
};

const mutedCellStyle: React.CSSProperties = {
  ...bodyCellStyle,
  color: "#526071",
};

const sourceLinkStyle: React.CSSProperties = {
  color: "#0f172a",
  fontWeight: 700,
  textDecoration: "none",
};

const actionButtonStyle: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 12,
  background: "#fff",
  color: "#0f172a",
  padding: "9px 14px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const statusPillStyles: Record<string, React.CSSProperties> = {
  completed: { background: "#dcfce7", color: "#166534" },
  failed: { background: "#fee2e2", color: "#991b1b" },
  running: { background: "#dbeafe", color: "#1d4ed8" },
};

type IngestRun = {
  id: string;
  source: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  job_count: number;
  error_message: string | null;
  run_count: number;
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

type DeleteResponse = {
  ok: boolean;
  error?: string;
  deleted_count?: number;
  source?: string;
  day?: string;
};

type RetryIngestRunButtonProps = {
  runId: string;
  onDone?: () => Promise<void> | void;
};

type DeleteIngestRunButtonProps = {
  runId: string;
  onDone?: () => Promise<void> | void;
};

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "—";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function extractStructuredErrorMessage(value: string): string | null {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return null;

    const candidates = [parsed.message, parsed.error, parsed.details, parsed.hint, parsed.code];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
  } catch {}

  return null;
}

function formatErrorMessage(value: unknown): string {
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) return "—";
    if (normalized === "[object Object]") return "Legacy error details unavailable";
    const structured = extractStructuredErrorMessage(normalized);
    if (structured) return structured;
    return normalized;
  }
  if (value == null) return "—";

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

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
      <button type="button" onClick={onRetry} disabled={isRetrying} style={actionButtonStyle}>
        {isRetrying ? "Retrying..." : "Retry"}
      </button>
      {message ? <div style={{ fontSize: 12, color: "#15803d" }}>{message}</div> : null}
      {error ? <div style={{ fontSize: 12, color: "#b91c1c" }}>{error}</div> : null}
    </div>
  );
}

export function DeleteIngestRunButton({ runId, onDone }: DeleteIngestRunButtonProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    const confirmed = window.confirm("Delete this source/day ingest history from the runs list?");
    if (!confirmed) return;

    setIsDeleting(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch(`/api/ingest/runs/${encodeURIComponent(runId)}`, {
        method: "DELETE",
      });
      const payload = (await res.json()) as DeleteResponse;

      if (!res.ok || !payload.ok) {
        setError(payload.error ?? "Delete failed");
        return;
      }

      setMessage(`Deleted ${payload.deleted_count ?? 0} run record(s).`);
      if (onDone) {
        await onDone();
      }
    } catch {
      setError("Delete failed");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={onDelete} disabled={isDeleting} style={actionButtonStyle}>
        {isDeleting ? "Deleting..." : "Delete Day"}
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
    <>
      {loading ? <p style={{ margin: "0 0 12px", color: "#526071", fontSize: 14 }}>Loading ingest runs...</p> : null}
      {error ? <p style={{ margin: "0 0 12px", color: "#b91c1c", fontSize: 14 }}>{error}</p> : null}
      {!loading && !error ? (
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={headerCellStyle}>Source</th>
                <th style={headerCellStyle}>Status</th>
                <th style={headerCellStyle}>Runs</th>
                <th style={headerCellStyle}>Started At</th>
                <th style={headerCellStyle}>Finished At</th>
                <th style={headerCellStyle}>Job Count</th>
                <th style={headerCellStyle}>Error</th>
                <th style={headerCellStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 ? (
                <tr>
                  <td colSpan={8} style={mutedCellStyle}>No ingest runs found.</td>
                </tr>
              ) : (
                runs.map((run) => {
                  const normalizedStatus = run.status.toLowerCase();
                  const statusPillStyle = statusPillStyles[normalizedStatus] ?? {
                    background: "#e2e8f0",
                    color: "#334155",
                  };

                  return (
                    <tr key={run.id}>
                      <td style={bodyCellStyle}>
                        <a href={`/coach?run_id=${encodeURIComponent(run.id)}`} style={sourceLinkStyle}>
                          {run.source}
                        </a>
                      </td>
                      <td style={bodyCellStyle}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "4px 10px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 700,
                            textTransform: "capitalize",
                            ...statusPillStyle,
                          }}
                        >
                          {run.status}
                        </span>
                      </td>
                      <td style={bodyCellStyle}>{run.run_count}</td>
                      <td style={bodyCellStyle}>{formatTimestamp(run.started_at)}</td>
                      <td style={mutedCellStyle}>{formatTimestamp(run.finished_at)}</td>
                      <td style={bodyCellStyle}>{run.job_count}</td>
                      <td style={{ ...mutedCellStyle, maxWidth: 300 }}>{formatErrorMessage(run.error_message)}</td>
                      <td style={bodyCellStyle}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
                          {run.status === "failed" ? (
                            <RetryIngestRunButton runId={run.id} onDone={loadRuns} />
                          ) : null}
                          <DeleteIngestRunButton runId={run.id} onDone={loadRuns} />
                          {run.status !== "failed" ? <span>—</span> : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
