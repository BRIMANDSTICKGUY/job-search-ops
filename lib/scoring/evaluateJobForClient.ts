function locationCompatibility(job: any, profile: any) {
  const jobRemoteType = String(job?.remote_type ?? "").toLowerCase();
  const jobLocation = String(job?.location ?? "").toLowerCase();
  const profileRemoteOk = profile?.remote_ok === true;
  const profileLocations: string[] = Array.isArray(profile?.locations)
    ? profile.locations.map((v: unknown) => String(v ?? "").toLowerCase())
    : [];

  const matchesProfileLocation = profileLocations.some(
    (location) => location && jobLocation.includes(location)
  );

  if (jobRemoteType === "remote") {
    return profileRemoteOk ? 20 : 0;
  }

  if (jobRemoteType === "hybrid") {
    if (matchesProfileLocation) {
      return 15;
    }
    return 0;
  }

  if (jobRemoteType === "onsite") {
    if (matchesProfileLocation) {
      return 20;
    }
    return 0;
  }

  return 0;
}

export function evaluateJobForClient(job: any, profile: any) {
  const title = String(job?.title ?? "").toLowerCase();

  const targetTitles: string[] = Array.isArray(profile?.target_titles)
    ? profile.target_titles.map((v: unknown) => String(v ?? "").toLowerCase())
    : [];
  const targetKeywords: string[] = Array.isArray(profile?.target_keywords)
    ? profile.target_keywords.map((v: unknown) => String(v ?? "").toLowerCase())
    : [];
  const requiredKeywords: string[] = Array.isArray(profile?.required_keywords)
    ? profile.required_keywords.map((v: unknown) => String(v ?? "").toLowerCase())
    : [];
  const dealbreakerKeywords: string[] = Array.isArray(profile?.dealbreaker_keywords)
    ? profile.dealbreaker_keywords.map((v: unknown) => String(v ?? "").toLowerCase())
    : [];

  const hasDealbreaker = dealbreakerKeywords.some((kw) => kw && title.includes(kw));
  if (hasDealbreaker) {
    return {
      score: 0,
      titleScore: 0,
      keywordScore: 0,
      locationScore: 0,
    };
  }

  const missingRequired = requiredKeywords.some((kw) => kw && !title.includes(kw));
  if (missingRequired) {
    return {
      score: 0,
      titleScore: 0,
      keywordScore: 0,
      locationScore: 0,
    };
  }

  const titleScore = targetTitles.some((t) => t && title.includes(t)) ? 40 : 0;

  let keywordScore = 0;
  for (const kw of targetKeywords) {
    if (kw && title.includes(kw)) {
      keywordScore += 5;
    }
  }
  if (keywordScore > 30) {
    keywordScore = 30;
  }

  const locationScore = locationCompatibility(job, profile);

  return {
    score: titleScore + keywordScore + locationScore,
    titleScore,
    keywordScore,
    locationScore,
  };
}
