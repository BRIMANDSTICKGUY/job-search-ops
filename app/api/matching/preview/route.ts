import { NextRequest, NextResponse } from "next/server";
import { runMatchingForClient } from "@/lib/matching/runMatchingForClient";
import type {
  MatchClientProfile,
  MatchJobInput,
} from "@/lib/matching/types";

type PreviewBody = {
  profile?: unknown;
  jobs?: unknown;
};

export async function POST(req: NextRequest) {
  let body: PreviewBody;

  try {
    body = (await req.json()) as PreviewBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const profile = body.profile as MatchClientProfile | undefined;
  const jobs = body.jobs as MatchJobInput[] | undefined;

  if (!profile || typeof profile !== "object") {
    return NextResponse.json(
      { ok: false, error: "profile is required" },
      { status: 400 }
    );
  }

  if (
    typeof profile.primary_role !== "string" ||
    profile.primary_role.trim().length === 0
  ) {
    return NextResponse.json(
      { ok: false, error: "profile.primary_role is required" },
      { status: 400 }
    );
  }

  if (!Array.isArray(jobs)) {
    return NextResponse.json(
      { ok: false, error: "jobs must be an array" },
      { status: 400 }
    );
  }

  const results = runMatchingForClient(profile, jobs);

  return NextResponse.json({ ok: true, results });
}
