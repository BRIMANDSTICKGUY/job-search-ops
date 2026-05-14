export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getCoachSession } from "@/lib/auth/coach";

export async function GET(req: Request) {
  const { user, isCoach } = await getCoachSession(req);

  if (!user) {
    return NextResponse.json({
      ok: true,
      authenticated: false,
      email: null,
      isCoach: false,
      redirectPath: "/login",
    });
  }

  return NextResponse.json({
    ok: true,
    authenticated: true,
    email: user.email ?? null,
    isCoach,
    redirectPath: isCoach ? "/coach" : "/client",
  });
}