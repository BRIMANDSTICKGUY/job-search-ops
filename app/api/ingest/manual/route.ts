export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ManualIngestBody = {
  title?: unknown;
  company?: unknown;
  link?: unknown;
};

function errorResponse(message: string, status = 400) {
  return NextResponse.json(
    { ok: false, error: message },
    { status }
  );
}

export async function POST(req: Request) {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Manual ingest: missing Supabase env");
    return errorResponse("Server misconfiguration", 500);
  }

  let body: ManualIngestBody;
  try {
    body = (await req.json()) as ManualIngestBody;
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const company = typeof body.company === "string" ? body.company.trim() : "";

  const link =
    body.link === null
      ? null
      : typeof body.link === "string"
        ? body.link.trim() || null
        : undefined;

  if (!title || !company || link === undefined) {
    return errorResponse("Missing required fields: title, company, link");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data, error } = await supabase
      .from("jobs")
      .insert({ title, company, link, source: "manual" })
      .select("id")
      .single();

    if (error || !data) {
      console.error("Manual ingest insert failed", error);
      return errorResponse("Failed to add job to intake", 500);
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (err) {
    console.error("Manual ingest unexpected error", err);
    return errorResponse("Unexpected server error", 500);
  }
}
