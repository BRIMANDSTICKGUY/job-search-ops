import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type AssignJobBody = {
  client_id?: unknown;
  job_id?: unknown;
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

  if (!clientId || !isUuid(clientId)) {
    return badRequest("client_id must be a valid UUID");
  }

  if (!jobId) {
    return badRequest("job_id is required");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: existing, error: existingError } = await supabase
    .from("job_assignments")
    .select("id")
    .eq("client_id", clientId)
    .eq("job_id", jobId)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    return serverError(existingError.message || "Failed to check assignment");
  }

  if (existing) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const { error: insertError } = await supabase.from("job_assignments").insert({
    client_id: clientId,
    job_id: jobId,
    assigned_at: new Date().toISOString(),
    assigned_by: null,
  });

  if (insertError) {
    return serverError(insertError.message || "Failed to insert assignment");
  }

  return NextResponse.json({ ok: true, inserted: true });
}
