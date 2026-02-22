import { NextResponse } from "next/server";

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

  console.error("[CRON_DIAG][run] EXIT PRE-SUPABASE");

  return NextResponse.json({
    ok: true,
    marker: "PRE_SUPABASE_OK",
  });
}
