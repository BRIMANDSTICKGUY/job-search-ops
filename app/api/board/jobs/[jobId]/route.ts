export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type RouteContext = {
  params: Promise<{ jobId: string }> | { jobId: string };
};

type PatchBody = {
  lane?: unknown;
  outcome_status?: unknown;
};

const VALID_LANES = new Set(["INBOX", "VERIFIED", "CLIENT-SENT", "WATCHLIST", "REJECTED"]);
const VALID_OUTCOMES = new Set(["interview", "no_response", "rejected", "offer"]);

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

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const auth = await getAuthedSupabase(req);
    if ("error" in auth) return auth.error;

    const resolvedParams = await context.params;
    const jobId = resolvedParams?.jobId?.trim();
    if (!jobId) {
      return badRequest("Missing job id");
    }

    let body: PatchBody;
    try {
      body = (await req.json()) as PatchBody;
    } catch {
      return badRequest("Invalid JSON body");
    }

    const patch: Record<string, unknown> = {};

    if (body.lane !== undefined) {
      if (typeof body.lane !== "string") {
        return badRequest("lane must be a string");
      }

      const lane = body.lane.trim().toUpperCase();
      if (!VALID_LANES.has(lane)) {
        return badRequest("Invalid lane");
      }

      patch.lane = lane;
    }

    if (body.outcome_status !== undefined) {
      if (body.outcome_status === null || body.outcome_status === "") {
        patch.outcome_status = null;
        patch.last_response_at = null;
      } else if (typeof body.outcome_status === "string") {
        const outcomeStatus = body.outcome_status.trim();
        if (!VALID_OUTCOMES.has(outcomeStatus)) {
          return badRequest("Invalid outcome status");
        }

        patch.outcome_status = outcomeStatus;
        patch.last_response_at = new Date().toISOString();
      } else {
        return badRequest("Invalid outcome status");
      }
    }

    if (Object.keys(patch).length === 0) {
      return badRequest("No supported fields to update");
    }

    const { error } = await auth.supabase.from("jobs").update(patch).eq("id", jobId);

    if (error) {
      return serverError(error.message || "Failed to update job");
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Unexpected server error");
  }
}