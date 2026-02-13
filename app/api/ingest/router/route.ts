export const runtime = "nodejs";

import crypto from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ingestJob } from "@/lib/ingest/ingestJob";

type RouterIngestBody = {
  source?: unknown;
  title?: unknown;
  company?: unknown;
  link?: unknown;
  created_by_role?: unknown;
  created_by_id?: unknown;
  source_detail?: unknown;
  raw_payload?: unknown;
};

type CreatedByRole = "coach" | "client" | "system";
const ALLOWED_SOURCES = ["manual", "greenhouse", "lever", "ashby"] as const;

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function isCreatedByRole(value: unknown): value is CreatedByRole {
  return value === "coach" || value === "client" || value === "system";
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  const ingestRunId = crypto.randomUUID();

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Ingest router missing Supabase env", {
      request_id: requestId,
      source: null,
      title: null,
      company: null,
    });
    return errorResponse("Server misconfiguration", 500);
  }

  let body: RouterIngestBody;
  try {
    body = (await req.json()) as RouterIngestBody;
  } catch {
    console.error("Ingest router invalid JSON", {
      request_id: requestId,
      source: null,
      title: null,
      company: null,
    });
    return errorResponse("Invalid JSON body", 400);
  }

  const source = typeof body.source === "string" ? body.source.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const company = typeof body.company === "string" ? body.company.trim() : "";

  if (!source || !title || !company) {
    return errorResponse("Missing required fields: source, title, company", 400);
  }

  if (!ALLOWED_SOURCES.includes(source as (typeof ALLOWED_SOURCES)[number])) {
    return errorResponse("Source not allowed", 403);
  }

  if (process.env.INGEST_DISABLED === "true") {
    console.warn("Ingest router blocked by kill switch", {
      request_id: requestId,
      source,
      title,
      company,
    });
    return errorResponse("Ingest temporarily disabled", 503);
  }

  const link =
    body.link === null
      ? null
      : typeof body.link === "string"
        ? body.link.trim() || null
        : undefined;

  if (body.link !== undefined && link === undefined) {
    return errorResponse("Invalid field: link must be string or null", 400);
  }

  const createdByRole: CreatedByRole = isCreatedByRole(body.created_by_role)
    ? body.created_by_role
    : "system";

  const createdById =
    body.created_by_id === null
      ? null
      : typeof body.created_by_id === "string"
        ? body.created_by_id
        : body.created_by_id === undefined
          ? null
          : undefined;

  if (createdById === undefined) {
    return errorResponse("Invalid field: created_by_id must be string or null", 400);
  }

  const sourceDetail =
    body.source_detail === undefined
      ? undefined
      : typeof body.source_detail === "string"
        ? body.source_detail
        : undefined;

  if (body.source_detail !== undefined && sourceDetail === undefined) {
    return errorResponse("Invalid field: source_detail must be string", 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.info("Ingest router request started", {
    request_id: requestId,
    source,
    title,
    company,
  });

  try {
    const result = await ingestJob({
      source,
      title,
      company,
      link: link ?? null,
      created_by_role: createdByRole,
      created_by_id: createdById,
      ingest_run_id: ingestRunId,
      raw_payload: body.raw_payload,
      source_detail: sourceDetail,
      supabase,
    });

    if (!result.ok && result.reason === "duplicate") {
      console.warn("Ingest router duplicate detected", {
        request_id: requestId,
        source,
        title,
        company,
      });
      return errorResponse(
        "Duplicate: job already exists for this title and company",
        409
      );
    }

    if (!result.ok) {
      console.error("Ingest router unexpected ingest result", {
        request_id: requestId,
        source,
        title,
        company,
        result,
      });
      return errorResponse("Failed to ingest job", 500);
    }

    console.info("Ingest router succeeded", {
      request_id: requestId,
      source,
      title,
      company,
      job_id: result.job_id,
    });
    return NextResponse.json({ ok: true, id: result.job_id });
  } catch (error) {
    console.error("Ingest router failed", {
      request_id: requestId,
      source,
      title,
      company,
      error,
    });
    return errorResponse("Unexpected server error", 500);
  }
}
