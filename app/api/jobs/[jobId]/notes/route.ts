import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const authorization = req.headers.get("authorization");
  const supabase = createServerClient({ authorization });

  const { data, error } = await supabase
    .from("job_notes")
    .select("id, author_role, author_id, body, created_at")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    job_id: jobId,
    notes: data,
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const authorization = req.headers.get("authorization");
  const supabase = createServerClient({ authorization });
  const payload = await req.json();

  if (!payload?.body || typeof payload.body !== "string") {
    return NextResponse.json(
      { ok: false, error: "Note body required" },
      { status: 400 }
    );
  }

  const body = payload.body.trim();
  if (body.length === 0 || body.length > 2000) {
    return NextResponse.json(
      { ok: false, error: "Invalid note length" },
      { status: 400 }
    );
  }

  const authHeader = authorization;
  const accessToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(accessToken || undefined);

  if (authError || !user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const author_role = payload.author_role === "coach" ? "coach" : "client";

  const { data, error } = await supabase
    .from("job_notes")
    .insert({
      job_id: jobId,
      author_role,
      author_id: user.id,
      body,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    note_id: data.id,
  });
}
