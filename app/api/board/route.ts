export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type JobRow = {
  id: string;
  title: string | null;
  company: string | null;
  link: string | null;
  location: string | null;
  lane: string | null;
  client_notes: string | null;
  internal_notes: string | null;
  outcome_status: "interview" | "no_response" | "rejected" | "offer" | null;
  last_response_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ClientRow = {
  id: string;
  name: string | null;
  auth_user_id: string | null;
};

type AssignmentRow = {
  job_id: string | null;
  client_id_uuid: string | null;
  client_id_legacy: string | null;
};

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

function serverError(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 500 });
}

async function getAuthedSupabase(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return { error: serverError("Missing Supabase env") };
  }

  const authorization = req.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!accessToken) {
    return { error: unauthorized() };
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return { error: unauthorized() };
  }

  return { supabase, user };
}

export async function GET(req: Request) {
  try {
    const auth = await getAuthedSupabase(req);
    if ("error" in auth) return auth.error;

    const [jobsResult, clientsResult, assignmentsResult] = await Promise.all([
      auth.supabase
        .from("jobs")
        .select("id, title, company, link, location, lane, client_notes, internal_notes, outcome_status, last_response_at, created_at, updated_at")
        .eq("is_test", false)
        .order("created_at", { ascending: false })
        .limit(500),
      auth.supabase
        .from("clients")
        .select("id, name, auth_user_id")
        .order("name", { ascending: true }),
      auth.supabase
        .from("job_assignments")
        .select("job_id, client_id_uuid, client_id_legacy")
        .limit(2000),
    ]);

    if (jobsResult.error) {
      return serverError(jobsResult.error.message || "Failed to load jobs");
    }

    if (clientsResult.error) {
      return serverError(clientsResult.error.message || "Failed to load clients");
    }

    if (assignmentsResult.error) {
      return serverError(assignmentsResult.error.message || "Failed to load assignments");
    }

    const clients = (clientsResult.data ?? []) as ClientRow[];
    const jobs = (jobsResult.data ?? []) as JobRow[];
    const assignments = (assignmentsResult.data ?? []) as AssignmentRow[];

    const clientIdByAssignmentKey = new Map<string, string>();
    for (const client of clients) {
      const clientId = client.id.trim();
      if (!clientId) continue;

      clientIdByAssignmentKey.set(`legacy:${clientId}`, clientId);

      const authUserId = (client.auth_user_id ?? "").trim();
      if (authUserId) {
        clientIdByAssignmentKey.set(`uuid:${authUserId}`, clientId);
      }
    }

    const assignedClientIdsByJobId = new Map<string, Set<string>>();
    for (const assignment of assignments) {
      const jobId = (assignment.job_id ?? "").trim();
      if (!jobId) continue;

      const mappedClientId =
        ((assignment.client_id_uuid ?? "").trim() &&
          clientIdByAssignmentKey.get(`uuid:${(assignment.client_id_uuid ?? "").trim()}`)) ||
        ((assignment.client_id_legacy ?? "").trim() &&
          clientIdByAssignmentKey.get(`legacy:${(assignment.client_id_legacy ?? "").trim()}`)) ||
        null;

      if (!mappedClientId) continue;

      const current = assignedClientIdsByJobId.get(jobId) ?? new Set<string>();
      current.add(mappedClientId);
      assignedClientIdsByJobId.set(jobId, current);
    }

    return NextResponse.json({
      ok: true,
      clients: clients.map((client) => ({
        id: client.id,
        name: client.name ?? "",
        email: "",
      })),
      jobs: jobs.map((job) => ({
        id: job.id,
        title: job.title ?? "",
        company: job.company ?? "",
        link: job.link ?? "",
        location: job.location ?? "",
        salary: "",
        lane: job.lane ?? "INBOX",
        assignedClientIds: Array.from(assignedClientIdsByJobId.get(job.id) ?? []),
        clientNotes: job.client_notes ?? "",
        internalNotes: job.internal_notes ?? "",
        createdAt: job.created_at ? new Date(job.created_at).getTime() : Date.now(),
        movedAt: job.updated_at ? new Date(job.updated_at).getTime() : job.created_at ? new Date(job.created_at).getTime() : Date.now(),
        outcome_status: job.outcome_status,
        last_response_at: job.last_response_at,
      })),
    });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Unexpected server error");
  }
}