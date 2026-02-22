import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  console.error("[CRON_DIAG][run] ENTER");

  let body: unknown;
  try {
    body = await req.json();
    console.error("[CRON_DIAG][run] JSON OK");
  } catch (e) {
    console.error("[CRON_DIAG][run] JSON FAIL", e);
    return NextResponse.json({ ok: false, step: "json" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.error("[CRON_DIAG][run] ENV CHECK", {
    has_url: !!supabaseUrl,
    has_service_key: !!serviceRoleKey,
  });

  const supabase = createClient(
    supabaseUrl!,
    serviceRoleKey!
  );

  console.error("[CRON_DIAG][run] Supabase Client Initialized");

  return NextResponse.json({
    ok: true,
    marker: "SUPABASE_CLIENT_OK",
  });
}
