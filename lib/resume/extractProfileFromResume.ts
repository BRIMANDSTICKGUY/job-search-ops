import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

export type ExtractedResumeProfile = {
  file_name: string;
  primary_role: string;
  secondary_role: string;
  career_level: "" | "early" | "mid" | "senior" | "executive";
  core_skills: string[];
  industry_keywords: string[];
  preferred_locations: string[];
  remote_preference: "remote" | "hybrid" | "onsite" | "all";
  dealbreakers: string[];
  text_preview: string;
};

type RolePattern = {
  label: string;
  keywords: string[];
};

const MAX_PREVIEW_LENGTH = 500;
const ROLE_PATTERNS: RolePattern[] = [
  {
    label: "Software Engineer",
    keywords: [
      "software engineer",
      "software developer",
      "full stack",
      "fullstack",
      "backend engineer",
      "frontend engineer",
      "web developer",
      "application developer",
    ],
  },
  {
    label: "Product Manager",
    keywords: ["product manager", "product management", "product owner", "roadmap"],
  },
  {
    label: "Project Manager",
    keywords: ["project manager", "program manager", "pmp", "delivery manager"],
  },
  {
    label: "Data Analyst",
    keywords: ["data analyst", "business analyst", "reporting analyst", "analytics"],
  },
  {
    label: "Data Scientist",
    keywords: ["data scientist", "machine learning", "statistical model", "predictive"],
  },
  {
    label: "UX Designer",
    keywords: ["ux designer", "product designer", "ui designer", "interaction design"],
  },
  {
    label: "Marketing Manager",
    keywords: ["marketing manager", "growth marketing", "demand generation", "brand strategy"],
  },
  {
    label: "Sales Manager",
    keywords: ["sales manager", "account executive", "business development", "pipeline"],
  },
  {
    label: "Customer Success Manager",
    keywords: ["customer success", "account management", "client success", "renewals"],
  },
  {
    label: "Operations Manager",
    keywords: ["operations manager", "business operations", "ops manager", "process improvement"],
  },
  {
    label: "Recruiter",
    keywords: ["recruiter", "talent acquisition", "sourcing", "candidate pipeline"],
  },
  {
    label: "Finance Manager",
    keywords: ["finance manager", "financial analyst", "fp&a", "budgeting"],
  },
];

const SKILL_TERMS = [
  "javascript",
  "typescript",
  "react",
  "next.js",
  "node.js",
  "python",
  "java",
  "sql",
  "postgresql",
  "aws",
  "azure",
  "gcp",
  "docker",
  "kubernetes",
  "figma",
  "tableau",
  "power bi",
  "excel",
  "salesforce",
  "hubspot",
  "seo",
  "sem",
  "google analytics",
  "jira",
  "notion",
  "airtable",
  "photoshop",
  "illustrator",
  "communication",
  "stakeholder management",
  "roadmapping",
  "agile",
  "scrum",
  "project management",
  "product strategy",
  "customer success",
  "financial modeling",
  "forecasting",
  "etl",
  "machine learning",
];

const INDUSTRY_TERMS = [
  "saas",
  "fintech",
  "healthcare",
  "health tech",
  "edtech",
  "ecommerce",
  "retail",
  "logistics",
  "transportation",
  "manufacturing",
  "media",
  "adtech",
  "cybersecurity",
  "real estate",
  "nonprofit",
  "government",
  "insurance",
  "banking",
];

const LOCATION_PATTERNS = [
  /location[:\s]+([^\n|]+)/i,
  /based in[:\s]+([^\n|]+)/i,
  /located in[:\s]+([^\n|]+)/i,
  /open to relocate to[:\s]+([^\n|]+)/i,
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\u0000/g, " ").replace(/\s+/g, " ").trim();
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function scoreRoles(text: string): Array<{ label: string; score: number }> {
  return ROLE_PATTERNS.map((role) => {
    const score = role.keywords.reduce((sum, keyword) => {
      const matches = text.match(new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "gi"));
      return sum + (matches?.length ?? 0);
    }, 0);

    return { label: role.label, score };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
}

function extractCareerLevel(text: string): ExtractedResumeProfile["career_level"] {
  if (/(chief|vp|vice president|head of|director|executive)/i.test(text)) return "executive";
  if (/(principal|staff|senior|lead)/i.test(text)) return "senior";
  if (/(manager|strategist|analyst|engineer|designer|specialist)/i.test(text)) return "mid";
  if (/(intern|junior|entry level|associate)/i.test(text)) return "early";
  return "";
}

function extractRemotePreference(text: string): ExtractedResumeProfile["remote_preference"] {
  const hasRemote = /\bremote\b/i.test(text);
  const hasHybrid = /\bhybrid\b/i.test(text);
  const hasOnsite = /\bonsite\b|on-site|in office/i.test(text);

  if (hasRemote && hasHybrid) return "all";
  if (hasRemote) return "remote";
  if (hasHybrid) return "hybrid";
  if (hasOnsite) return "onsite";
  return "all";
}

function extractTerms(text: string, terms: string[], maxItems: number): string[] {
  const found = terms.filter((term) => new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(text));
  return unique(found.map((term) => titleCase(term))).slice(0, maxItems);
}

function extractPreferredLocations(rawText: string): string[] {
  const matches: string[] = [];

  for (const pattern of LOCATION_PATTERNS) {
    const result = rawText.match(pattern);
    if (!result?.[1]) continue;

    const cleaned = result[1]
      .split(/[,;/]/)
      .map((part) => normalizeWhitespace(part))
      .filter((part) => part.length >= 2 && part.length <= 40);

    matches.push(...cleaned);
  }

  if (/new york/i.test(rawText)) matches.push("New York");
  if (/san francisco/i.test(rawText)) matches.push("San Francisco");
  if (/los angeles/i.test(rawText)) matches.push("Los Angeles");
  if (/chicago/i.test(rawText)) matches.push("Chicago");
  if (/atlanta/i.test(rawText)) matches.push("Atlanta");
  if (/austin/i.test(rawText)) matches.push("Austin");
  if (/remote/i.test(rawText)) matches.push("Remote");

  return unique(matches.map(titleCase)).slice(0, 5);
}

function extractDealbreakers(text: string): string[] {
  const items: string[] = [];

  if (/no relocation/i.test(text)) items.push("No relocation");
  if (/remote only/i.test(text)) items.push("Remote only");
  if (/sponsorship required/i.test(text)) items.push("Requires sponsorship");
  if (/contract only/i.test(text)) items.push("Contract only");

  return items;
}

export async function extractTextFromResumeFile(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);
  const lowerName = file.name.toLowerCase();

  if (file.type === "application/pdf" || lowerName.endsWith(".pdf")) {
    const parser = new PDFParse({ data: bytes });
    try {
      const result = await parser.getText();
      return normalizeWhitespace(result.text);
    } finally {
      await parser.destroy();
    }
  }

  if (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer: bytes });
    return normalizeWhitespace(result.value);
  }

  if (
    file.type.startsWith("text/") ||
    lowerName.endsWith(".txt") ||
    lowerName.endsWith(".md") ||
    lowerName.endsWith(".rtf")
  ) {
    return normalizeWhitespace(bytes.toString("utf8"));
  }

  throw new Error("Unsupported resume format. Upload PDF, DOCX, TXT, MD, or RTF.");
}

export function extractProfileFromResumeText(
  rawText: string,
  fileName: string
): ExtractedResumeProfile {
  const normalizedText = normalizeWhitespace(rawText);
  const lowerText = normalizedText.toLowerCase();
  const scoredRoles = scoreRoles(lowerText);

  return {
    file_name: fileName,
    primary_role: scoredRoles[0]?.label ?? "",
    secondary_role: scoredRoles[1]?.label ?? "",
    career_level: extractCareerLevel(lowerText),
    core_skills: extractTerms(lowerText, SKILL_TERMS, 10),
    industry_keywords: extractTerms(lowerText, INDUSTRY_TERMS, 6),
    preferred_locations: extractPreferredLocations(rawText),
    remote_preference: extractRemotePreference(lowerText),
    dealbreakers: extractDealbreakers(rawText),
    text_preview: normalizedText.slice(0, MAX_PREVIEW_LENGTH),
  };
}