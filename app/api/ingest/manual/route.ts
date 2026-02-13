export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

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
    const headerIdempotencyKey = req.headers.get("x-idempotency-key");
    const idempotencyKey =
      typeof headerIdempotencyKey === "string" && headerIdempotencyKey.trim().length > 0
        ? headerIdempotencyKey.trim()
        : randomUUID();

    const { data: replayJob, error: replayError } = await supabase
      .from("jobs")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .limit(1)
      .maybeSingle();

    if (replayError) {
      console.error("Manual ingest idempotency lookup failed", replayError);
      return errorResponse("Unexpected server error", 500);
    }

    if (replayJob?.id) {
      console.info("Manual ingest idempotency replay", {
        idempotency_key: idempotencyKey,
        existing_job_id: replayJob.id,
      });
      return NextResponse.json({ ok: true, id: replayJob.id });
    }

    const normalizedTitle = title.trim().toLowerCase();
    const normalizedCompany = company.trim().toLowerCase();

    const { data: existingJob, error: dedupeError } = await supabase
      .from("jobs")
      .select("id")
      .ilike("title", normalizedTitle)
      .ilike("company", normalizedCompany)
      .limit(1)
      .maybeSingle();

    if (dedupeError) {
      console.error("Manual ingest dedupe lookup failed", dedupeError);
      return errorResponse("Unexpected server error", 500);
    }

    if (existingJob?.id) {
      console.info("Manual ingest duplicate detected", {
        title: normalizedTitle,
        company: normalizedCompany,
        existing_job_id: existingJob.id,
      });
      return errorResponse(
        "Duplicate: job already exists for this title and company",
        409
      );
    }

    const { data, error } = await supabase
      .from("jobs")
      .insert({ title, company, link, source: "manual", idempotency_key: idempotencyKey })
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
