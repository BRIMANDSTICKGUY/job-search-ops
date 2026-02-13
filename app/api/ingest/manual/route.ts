export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ManualIngestBody = {
  title?: unknown;
  company?: unknown;
  link?: unknown;
};

export async function POST(req: Request) {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { ok: false, error: "Missing Supabase env" },
      { status: 500 }
    );
  }

  let body: ManualIngestBody;
  try {
    body = (await req.json()) as ManualIngestBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
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
    return NextResponse.json(
      { ok: false, error: "Missing required fields: title, company, link" },
      { status: 400 }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("jobs")
    .insert({
      title,
      company,
      link,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Failed to insert job" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    id: data.id,
  });
}
