"use client";

import React, { useMemo, useState } from "react";
import type { Client, Job, Mode, LaneId } from "../types";

function formatMovedAt(ts?: number) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "";
  }
}

type Props = {
  job: Job;
  clients: Client[];
  mode: Mode;
  laneId: LaneId;
  isSelected: boolean;
  onToggleSelected: (jobId: string) => void;

  // Mutations
  onUpdateJob: (jobId: string, patch: Partial<Job>) => void;
  onMoveJob: (jobId: string, toLane: LaneId) => void;

  // Coach-only
  canEditInternalNotes: boolean;
};

export default function JobCard({
  job,
  clients,
  mode,
  laneId,
  isSelected,
  onToggleSelected,
  onUpdateJob,
  onMoveJob,
  canEditInternalNotes,
}: Props) {
  // Defensive: never let undefined job crash render
  const safeJob: Job = job ?? {
    id: "missing",
    title: "",
    company: "",
    link: "",
    lane: laneId,
    assignedClientIds: [],
    clientNotes: "",
    internalNotes: "",
    movedAt: Date.now(),
    createdAt: Date.now(),
  };

  const [expanded, setExpanded] = useState(true);

  // ✅ IMPORTANT: per-card dropdown state (LOCAL to each card)
  // This prevents Bulk Assign selection from “bleeding” into all cards.
  const [addClientId, setAddClientId] = useState<string>("");

  const clientMap = useMemo(() => {
    const list = Array.isArray(clients) ? clients : [];
    return new Map(list.map((c) => [c.id, c]));
  }, [clients]);

  const assignedClientIdsSafe = useMemo(() => {
    const ids = Array.isArray(safeJob.assignedClientIds) ? safeJob.assignedClientIds : [];
    // remove junk + dedupe
    return Array.from(new Set(ids.filter(Boolean)));
  }, [safeJob.assignedClientIds]);

  const assignedClients = useMemo(() => {
    return assignedClientIdsSafe
      .map((id) => clientMap.get(id))
      .filter(Boolean) as Client[];
  }, [assignedClientIdsSafe, clientMap]);

  const movedAtLabel = formatMovedAt(safeJob.movedAt);

  function setAssignedClientIds(nextIds: string[]) {
    const uniq = Array.from(new Set(nextIds.filter(Boolean)));
    // Optional: sort by client name for stable display
    uniq.sort((a, b) => {
      const an = clientMap.get(a)?.name ?? "";
      const bn = clientMap.get(b)?.name ?? "";
      return an.localeCompare(bn);
    });
    onUpdateJob(safeJob.id, { assignedClientIds: uniq });
  }

  function addAssignedClient() {
    if (!addClientId) return;
    if (assignedClientIdsSafe.includes(addClientId)) {
      setAddClientId("");
      return;
    }
    setAssignedClientIds([...assignedClientIdsSafe, addClientId]);
    setAddClientId(""); // reset after add
  }

  function removeAssignedClient(id: string) {
    const next = assignedClientIdsSafe.filter((x) => x !== id);
    setAssignedClientIds(next);
  }

  const showInternalNotes = mode === "coach" && canEditInternalNotes;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm mb-3">
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={!!isSelected}
            onChange={() => onToggleSelected(safeJob.id)}
            aria-label="select job"
          />
          <div>
            <div className="font-semibold">
              {safeJob.title || "(Untitled)"}{" "}
              <span className="font-normal text-slate-600">
                {safeJob.company ? `— ${safeJob.company}` : ""}
              </span>
            </div>

            {safeJob.link ? (
              <a
                href={safeJob.link}
                target="_blank"
                rel="noreferrer"
                className="text-blue-700 underline text-sm"
              >
                {safeJob.link}
              </a>
            ) : null}

            <div className="text-xs text-slate-500 mt-1">
              {movedAtLabel ? `Moved: ${movedAtLabel}` : null}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={safeJob.lane}
            onChange={(e) => onMoveJob(safeJob.id, e.target.value as LaneId)}
            className="border border-slate-300 rounded px-2 py-1 text-sm"
            aria-label="move lane"
          >
            <option value="inbox">INBOX</option>
            <option value="verified">VERIFIED</option>
            <option value="clientSent">CLIENT-SENT</option>
            <option value="watchlist">WATCHLIST</option>
            <option value="rejected">REJECTED</option>
          </select>

          <button
            className="border border-slate-300 rounded px-2 py-1 text-sm"
            onClick={() => setExpanded((x) => !x)}
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>

      {mode === "coach" && safeJob.lane === "inbox" ? (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2">
            <button
              className="border border-slate-300 rounded px-2 py-1 text-sm"
              onClick={() => onMoveJob(safeJob.id, "verified")}
              type="button"
            >
              VERIFY
            </button>
            <button
              className="border border-slate-300 rounded px-2 py-1 text-sm"
              onClick={() => onMoveJob(safeJob.id, "watchlist")}
              type="button"
            >
              WATCHLIST
            </button>
            <button
              className="border border-slate-300 rounded px-2 py-1 text-sm"
              onClick={() => onMoveJob(safeJob.id, "rejected")}
              type="button"
            >
              REJECT
            </button>
          </div>
        </div>
      ) : null}

      {expanded ? (
        <div className="px-4 pb-4">
          {/* Assigned clients chips */}
          <div className="text-sm mb-2">
            <span className="font-semibold">Assigned:</span>{" "}
            {assignedClients.length === 0 ? (
              <span className="text-slate-500">none</span>
            ) : (
              <span className="inline-flex flex-wrap gap-2">
                {assignedClients.map((c) => (
                  <span
                    key={c.id}
                    className="inline-flex items-center gap-1 border border-slate-300 rounded-full px-2 py-1 text-xs"
                  >
                    {c.name}
                    <button
                      onClick={() => removeAssignedClient(c.id)}
                      className="text-slate-700 hover:text-black"
                      aria-label={`remove ${c.name}`}
                      type="button"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </span>
            )}
          </div>

          {/* Per-job assign (local state) */}
          {mode === "coach" ? (
            <div className="flex items-center gap-2 mb-3">
              <select
                value={addClientId}
                onChange={(e) => setAddClientId(e.target.value)}
                className="border border-slate-300 rounded px-2 py-1 text-sm"
                aria-label="assign client select"
              >
                <option value="">Assign clients…</option>
                {(Array.isArray(clients) ? clients : []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                onClick={addAssignedClient}
                className="border border-slate-300 rounded px-2 py-1 text-sm"
                type="button"
                disabled={!addClientId}
                title="Adds this client to this job (does not overwrite)"
              >
                Add
              </button>
            </div>
          ) : null}

          {/* Client safe notes */}
          <div className="mb-3">
            <div className="text-sm font-semibold">Client Notes (client-safe)</div>
            <textarea
              value={safeJob.clientNotes ?? ""}
              onChange={(e) => onUpdateJob(safeJob.id, { clientNotes: e.target.value })}
              className="w-full border border-slate-300 rounded p-2 text-sm"
              rows={3}
            />
          </div>

          {/* Internal notes */}
          {showInternalNotes ? (
            <div className="mb-2">
              <div className="text-sm font-semibold">Internal Notes (coach-only)</div>
              <textarea
                value={safeJob.internalNotes ?? ""}
                onChange={(e) => onUpdateJob(safeJob.id, { internalNotes: e.target.value })}
                className="w-full border border-slate-300 rounded p-2 text-sm"
                rows={3}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
