import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type AssignJobBody = {
  client_id?: unknown;
  job_id?: unknown;
};

type ExistingAssignmentRow = {
  id: string;
  client_id: string | null;
  client_id_uuid: string | null;
  client_id_legacy: string | null;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function badRequest(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

function serverError(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 500 });
}

export async function POST(req: Request) {
  const adminToken = req.headers.get("x-admin-token");
  if (!adminToken || adminToken !== process.env.ASSIGN_JOB_ADMIN_TOKEN) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return serverError("Missing Supabase env");
  }

  let body: AssignJobBody;
  try {
    body = (await req.json()) as AssignJobBody;
  } catch {
    return badRequest("Invalid JSON body");
  }

  const clientId = typeof body.client_id === "string" ? body.client_id.trim() : "";
  const jobId = typeof body.job_id === "string" ? body.job_id.trim() : "";

  if (!clientId) {
    return badRequest("client_id is required");
  }

  if (!jobId) {
    return badRequest("job_id is required");
  }

  if (!isUuid(clientId)) {
    return badRequest("client_id must be a valid UUID");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const clientIdUuid = clientId;

  const { data: existingRows, error: existingError } = await supabase
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

  const { error: insertError } = await supabase.from("job_assignments").insert({
    client_id: clientIdUuid,
    client_id_uuid: clientIdUuid,
    client_id_legacy: clientId,
    job_id: jobId,
    assigned_at: new Date().toISOString(),
    assigned_by: null,
  });

  if (insertError) {
    return serverError(insertError.message || "Failed to insert assignment");
  }

  return NextResponse.json({ ok: true, inserted: true });
}
