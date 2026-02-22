import { NextResponse } from "next/server";

export async function POST(req: Request) {
  console.error("[CRON_DIAG][run] HARD HIT");
  return NextResponse.json({
    ok: true,
    marker: "RUN_ROUTE_REACHED",
  });
}
