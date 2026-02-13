export const runtime = "nodejs";

import { NextResponse } from "next/server";
import crypto from "crypto";
import { headers } from "next/headers";

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

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const company = typeof body.company === "string" ? body.company.trim() : "";

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

  try {
    const requestHeaders = await headers();
    const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
    const proto = requestHeaders.get("x-forwarded-proto") ?? "http";

    if (!host) {
      console.error("Manual ingest adapter host resolution failed", {
        request_id: requestId,
        title,
        company,
      });
      return errorResponse("Unexpected server error", 500);
    }

    const routerResponse = await fetch(`${proto}://${host}/api/ingest/router`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "manual",
        title,
        company,
        link,
        created_by_role: "coach",
        created_by_id: null,
      }),
      cache: "no-store",
    });

    const payload = (await routerResponse.json()) as { ok?: boolean; id?: string; error?: string };

    if (routerResponse.status === 409) {
      return errorResponse(
        payload.error ?? "Duplicate: job already exists for this title and company",
        409
      );
    }

    if (routerResponse.ok && payload.ok && typeof payload.id === "string") {
      return NextResponse.json({ ok: true, id: payload.id });
    }

    if (!routerResponse.ok) {
      return errorResponse(payload.error ?? "Failed to add job to intake", routerResponse.status);
    }

    return errorResponse("Failed to add job to intake", 500);
  } catch (err) {
    console.error("Manual ingest adapter unexpected error", {
      request_id: requestId,
      title,
      company,
      error: err,
    });
    return errorResponse("Unexpected server error", 500);
  }
}
