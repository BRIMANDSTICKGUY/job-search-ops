import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

type RequestBody = {
  job_id?: unknown;
  action?: unknown;
};

type ClientJobAction = "viewed" | "applied" | "saved" | "dismissed";

const VALID_ACTIONS: ClientJobAction[] = [
  "viewed",
  "applied",
  "saved",
  "dismissed",
];

function parseBearerToken(authorization: string | null): string {
  if (!authorization) return "";
  if (!authorization.startsWith("Bearer ")) return "";
  return authorization.slice("Bearer ".length).trim();
}

export async function POST(req: NextRequest) {
  const authorization = req.headers.get("authorization");
  const supabase = createServerClient({ authorization });

  const accessToken = parseBearerToken(authorization);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(accessToken || undefined);

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const jobId = typeof body.job_id === "string" ? body.job_id.trim() : "";
  const action = typeof body.action === "string" ? body.action.trim() : "";

  if (!jobId || !VALID_ACTIONS.includes(action as ClientJobAction)) {
    return NextResponse.json(
      {
        ok: false,
        error: "job_id and valid action are required",
      },
      { status: 400 }
    );
  }

  const { data: matchRow, error: matchError } = await supabase
    .from("job_matches")
    .select("band")
    .eq("client_id", user.id)
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (matchError) {
    return NextResponse.json(
      { ok: false, error: matchError.message },
      { status: 500 }
    );
  }

  if (!matchRow) {
    return NextResponse.json(
      { ok: false, error: "Matching job_match not found" },
      { status: 404 }
    );
  }

  const { error: insertError } = await supabase.from("client_job_actions").insert({
    client_id: user.id,
    job_id: jobId,
    band_at_time: matchRow.band,
    action,
  });

  if (insertError) {
    return NextResponse.json(
      { ok: false, error: insertError.message },
      { status: 500 }
    );
  }

  return new NextResponse(null, { status: 204 });
}
