export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { ingestJob } from "@/lib/ingest/ingestJob";

type ManualIngestBody = {
  title?: unknown;
  company?: unknown;
  link?: unknown;
};

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  console.info("Manual ingest request started", {
    request_id: requestId,
    title: null,
    company: null,
  });

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

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const result = await ingestJob({
      source: "manual",
      title,
      company,
      link,
      created_by_role: "coach",
      created_by_id: null,
      supabase,
    });

    if (!result.ok && result.reason === "duplicate") {
      console.warn("Manual ingest duplicate detected", {
        request_id: requestId,
        title,
        company,
      });
      return errorResponse(
        "Duplicate: job already exists for this title and company",
        409
      );
    }

    if (!result.ok) {
      console.error("Manual ingest failed with unknown reason", {
        request_id: requestId,
        title,
        company,
      });
      return errorResponse("Failed to add job to intake", 500);
    }

    console.info("Manual ingest succeeded", {
      request_id: requestId,
      title,
      company,
      job_id: result.job_id,
    });
    return NextResponse.json({ ok: true, id: result.job_id });
  } catch (err) {
    console.error("Manual ingest unexpected error", {
      request_id: requestId,
      title,
      company,
      error: err,
    });
    return errorResponse("Unexpected server error", 500);
  }
}
