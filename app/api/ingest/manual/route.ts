export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

type ManualIngestBody = {
  title?: unknown;
  company?: unknown;
  link?: unknown;
};

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function buildIdempotencyKey(input: {
  source: string;
  title: string;
  company: string;
}) {
  const normalized = `${input.source}|${input.title}|${input.company}`;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Manual ingest: missing Supabase env", {
      request_id: requestId,
      title: null,
      company: null,
    });
    return errorResponse("Server misconfiguration", 500);
  }

  let body: ManualIngestBody;
  try {
    body = (await req.json()) as ManualIngestBody;
  } catch {
    console.warn("Manual ingest bad input: invalid JSON", {
      request_id: requestId,
      title: null,
      company: null,
    });
    return errorResponse("Invalid JSON body");
  }

  const title =
    typeof body.title === "string" ? body.title.trim() : "";
  const company =
    typeof body.company === "string" ? body.company.trim() : "";

  const link =
    body.link === null
      ? null
      : typeof body.link === "string"
        ? body.link.trim() || null
        : undefined;

  if (!title || !company || link === undefined) {
    console.warn("Manual ingest bad input: missing required fields", {
      request_id: requestId,
      title: title || null,
      company: company || null,
    });
    return errorResponse("Missing required fields: title, company, link");
  }

  const normalizedTitle = title.toLowerCase();
  const normalizedCompany = company.toLowerCase();
  const source = "manual";

  const idempotencyKey = buildIdempotencyKey({
    source,
    title: normalizedTitle,
    company: normalizedCompany,
  });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data, error } = await supabase
      .from("jobs")
      .insert({
        title,
        company,
        link,
        source,
        idempotency_key: idempotencyKey,
        created_by_role: "coach",
        created_by_id: null,
      })
      .select("id")
      .single();

    if (error) {
      // Unique violation = duplicate
      if (error.code === "23505") {
        console.warn("Manual ingest duplicate detected", {
          request_id: requestId,
          title,
          company,
          idempotency_key: idempotencyKey,
        });
        return errorResponse(
          "Duplicate: job already exists for this title and company",
          409
        );
      }

      console.error("Manual ingest insert failed", {
        request_id: requestId,
        title,
        company,
        idempotency_key: idempotencyKey,
        error,
      });
      return errorResponse("Failed to add job to intake", 500);
    }

    console.info("Manual ingest succeeded", {
      request_id: requestId,
      title,
      company,
      idempotency_key: idempotencyKey,
      job_id: data.id,
    });
    return NextResponse.json({ ok: true, id: data.id });
  } catch (err) {
    console.error("Manual ingest unexpected error", {
      request_id: requestId,
      title,
      company,
      idempotency_key: idempotencyKey,
      error: err,
    });
    return errorResponse("Unexpected server error", 500);
  }
}
