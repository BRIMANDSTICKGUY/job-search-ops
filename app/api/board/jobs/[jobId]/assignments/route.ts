export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type RouteContext = {
  params: Promise<{ jobId: string }> | { jobId: string };
};

type AssignmentBody = {
  client_id?: unknown;
};

type ExistingAssignmentRow = {
  id: string;
  client_id: string | null;
  client_id_uuid: string | null;
  client_id_legacy: string | null;
};

type ClientLookupRow = {
  id: string;
  auth_user_id: string | null;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
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

async function resolveClientUuid(supabase: SupabaseClient, clientId: string) {
  if (isUuid(clientId)) {
    return clientId;
  }

  const { data, error } = await supabase
    .from("clients")
    .select("id, auth_user_id")
    .eq("id", clientId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to load client");
  }

  const clientRow = (data ?? null) as ClientLookupRow | null;
  const authUserId = typeof clientRow?.auth_user_id === "string" ? clientRow.auth_user_id.trim() : "";
  if (!authUserId || !isUuid(authUserId)) {
    throw new Error("Client is not mapped to an auth user id");
  }

  return authUserId;
}

async function parseAssignmentRequest(req: Request) {
  let body: AssignmentBody;
  try {
    body = (await req.json()) as AssignmentBody;
  } catch {
    throw new Error("Invalid JSON body");
  }

  const clientId = typeof body.client_id === "string" ? body.client_id.trim() : "";
  if (!clientId) {
    throw new Error("client_id is required");
  }

  return clientId;
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const auth = await getAuthedSupabase(req);
    if ("error" in auth) return auth.error;

    const resolvedParams = await context.params;
    const jobId = resolvedParams?.jobId?.trim();
    if (!jobId) {
      return badRequest("Missing job id");
    }

    const clientId = await parseAssignmentRequest(req);
    const clientIdUuid = await resolveClientUuid(auth.supabase, clientId);

    const { data: existingRows, error: existingError } = await auth.supabase
      .from("job_assignments")
      .select("id, client_id, client_id_uuid, client_id_legacy")
      .eq("job_id", jobId)
      .limit(200);

    if (existingError) {
      return serverError(existingError.message || "Failed to check assignment");
    }

    const existing = ((existingRows ?? []) as ExistingAssignmentRow[]).find((row) => {
      const byClientId = (row.client_id ?? "").trim() === clientIdUuid;
      const byClientIdUuid = (row.client_id_uuid ?? "").trim() === clientIdUuid;
      const byLegacy = (row.client_id_legacy ?? "").trim() === clientId;
      return byClientId || byClientIdUuid || byLegacy;
    });

    if (existing) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const { error } = await auth.supabase.from("job_assignments").insert({
      job_id: jobId,
      client_id: clientIdUuid,
      client_id_uuid: clientIdUuid,
      client_id_legacy: clientId,
      assigned_at: new Date().toISOString(),
      assigned_by: null,
    });

    if (error) {
      return serverError(error.message || "Failed to add assignment");
    }

    return NextResponse.json({ ok: true, inserted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    if (message === "Invalid JSON body" || message === "client_id is required") {
      return badRequest(message);
    }
    return serverError(message);
  }
}

export async function DELETE(req: Request, context: RouteContext) {
  try {
    const auth = await getAuthedSupabase(req);
    if ("error" in auth) return auth.error;

    const resolvedParams = await context.params;
    const jobId = resolvedParams?.jobId?.trim();
    if (!jobId) {
      return badRequest("Missing job id");
    }

    const clientId = await parseAssignmentRequest(req);
    const clientIdUuid = await resolveClientUuid(auth.supabase, clientId);

    const { error } = await auth.supabase
      .from("job_assignments")
      .delete()
      .eq("job_id", jobId)
      .or(`client_id.eq.${clientIdUuid},client_id_uuid.eq.${clientIdUuid},client_id_legacy.eq.${clientId}`);

    if (error) {
      return serverError(error.message || "Failed to remove assignment");
    }

    return NextResponse.json({ ok: true, deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    if (message === "Invalid JSON body" || message === "client_id is required") {
      return badRequest(message);
    }
    return serverError(message);
  }
}