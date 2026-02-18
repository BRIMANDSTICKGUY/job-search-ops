import { NextResponse } from "next/server";

export function deny(
  req: Request,
  reason: string,
  status = 401
) {
  console.error("[api:deny]", {
    path: new URL(req.url).pathname,
    method: req.method,
    reason,
    hasAuthHeader: !!req.headers.get("authorization"),
    userAgent: req.headers.get("user-agent"),
  });

  return NextResponse.json(
    { ok: false, error: reason },
    { status }
  );
}
