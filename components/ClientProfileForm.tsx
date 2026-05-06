"use client";

import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type CareerLevel = "early" | "mid" | "senior" | "executive";
type RemotePreference = "remote" | "hybrid" | "onsite" | "all";

type ClientProfile = {
  id: string;
  client_id: string;
  primary_role: string;
  secondary_role: string | null;
  career_level: CareerLevel | null;
  core_skills: string[] | null;
  industry_keywords: string[] | null;
  preferred_locations: string[] | null;
  remote_preference: RemotePreference;
  salary_min: number | null;
  salary_max: number | null;
  dealbreakers: string[] | null;
  created_at: string;
  updated_at: string;
};

type ProfileResponse = {
  ok: boolean;
  profile?: ClientProfile | null;
  error?: string;
};

type ResumeExtractionResponse = {
  ok: boolean;
  extracted?: {
    file_name: string;
    primary_role: string;
    secondary_role: string;
    career_level: "" | CareerLevel;
    core_skills: string[];
    industry_keywords: string[];
    preferred_locations: string[];
    remote_preference: RemotePreference;
    dealbreakers: string[];
    text_preview: string;
  };
  resume_upload?: {
    id: string;
    file_name: string;
    content_type: string | null;
    file_size: number;
    extracted_text: string;
    extracted_profile: {
      file_name: string;
      primary_role: string;
      secondary_role: string;
      career_level: "" | CareerLevel;
      core_skills: string[];
      industry_keywords: string[];
      preferred_locations: string[];
      remote_preference: RemotePreference;
      dealbreakers: string[];
      text_preview: string;
    };
    created_at: string;
  } | null;
  persistence_available?: boolean;
  warning?: string;
  error?: string;
};

type ResumeUploadResponse = {
  ok: boolean;
  resume_upload?: {
    id: string;
    file_name: string;
    content_type: string | null;
    file_size: number;
    extracted_text: string;
    extracted_profile: {
      file_name: string;
      primary_role: string;
      secondary_role: string;
      career_level: "" | CareerLevel;
      core_skills: string[];
      industry_keywords: string[];
      preferred_locations: string[];
      remote_preference: RemotePreference;
      dealbreakers: string[];
      text_preview: string;
    };
    created_at: string;
  } | null;
  persistence_available?: boolean;
  error?: string;
};

type FormState = {
  primary_role: string;
  secondary_role: string;
  career_level: "" | CareerLevel;
  core_skills: string;
  industry_keywords: string;
  preferred_locations: string;
  remote_preference: RemotePreference;
  salary_min: string;
  salary_max: string;
  dealbreakers: string;
};

const DEFAULT_STATE: FormState = {
  primary_role: "",
  secondary_role: "",
  career_level: "",
  core_skills: "",
  industry_keywords: "",
  preferred_locations: "",
  remote_preference: "all",
  salary_min: "",
  salary_max: "",
  dealbreakers: "",
};

function toCommaSeparated(items: string[] | null | undefined): string {
  return (items ?? []).join(", ");
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function mergeCsvStrings(existing: string, incoming: string[]): string {
  const merged = Array.from(new Set([...splitCsv(existing), ...incoming]));
  return merged.join(", ");
}

export function ClientProfileForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [resumePreview, setResumePreview] = useState<string | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [latestResumeUpload, setLatestResumeUpload] = useState<ResumeUploadResponse["resume_upload"]>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_STATE);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      setLoading(true);
      setError(null);
      setWarning(null);

      try {
        const {
          data: { session },
        } = await getSupabaseBrowser().auth.getSession();

        const token = session?.access_token;
        if (!token) {
          if (!active) return;
          setError("Unauthorized");
          setLoading(false);
          return;
        }

        const res = await fetch("/api/client/profile", {
          method: "GET",
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });

        const payload = (await res.json()) as ProfileResponse;
        if (!res.ok || !payload.ok) {
          if (!active) return;
          setError(payload.error ?? "Failed to load profile");
          setLoading(false);
          return;
        }

        const profile = payload.profile ?? null;
        if (!active) return;

        if (profile) {
          setHasProfile(true);
          setForm({
            primary_role: profile.primary_role ?? "",
            secondary_role: profile.secondary_role ?? "",
            career_level: profile.career_level ?? "",
            core_skills: toCommaSeparated(profile.core_skills),
            industry_keywords: toCommaSeparated(profile.industry_keywords),
            preferred_locations: toCommaSeparated(profile.preferred_locations),
            remote_preference: profile.remote_preference,
            salary_min: profile.salary_min != null ? String(profile.salary_min) : "",
            salary_max: profile.salary_max != null ? String(profile.salary_max) : "",
            dealbreakers: toCommaSeparated(profile.dealbreakers),
          });
        } else {
          setHasProfile(false);
          setForm(DEFAULT_STATE);
        }

        const resumeRes = await fetch("/api/client/profile/resume", {
          method: "GET",
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });

        const resumePayload = (await resumeRes.json()) as ResumeUploadResponse;
        if (resumeRes.ok && resumePayload.ok) {
          setLatestResumeUpload(resumePayload.resume_upload ?? null);
          setResumePreview(resumePayload.resume_upload?.extracted_profile.text_preview ?? null);
          if (resumePayload.persistence_available === false) {
            setWarning("Resume upload history will appear after the database migration is applied. You can still import suggestions into the form now.");
          }
        }
      } catch {
        if (!active) return;
        setError("Failed to load profile");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadProfile();

    return () => {
      active = false;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const trimmedPrimary = form.primary_role.trim();
    if (trimmedPrimary.length === 0) {
      setError("Primary role is required");
      setSaving(false);
      return;
    }

    try {
      const {
        data: { session },
      } = await getSupabaseBrowser().auth.getSession();

      const token = session?.access_token;
      if (!token) {
        setError("Unauthorized");
        setSaving(false);
        return;
      }

      const payload = {
        primary_role: trimmedPrimary,
        secondary_role: form.secondary_role.trim() || null,
        career_level: form.career_level || null,
        core_skills: splitCsv(form.core_skills),
        industry_keywords: splitCsv(form.industry_keywords),
        preferred_locations: splitCsv(form.preferred_locations),
        remote_preference: form.remote_preference,
        salary_min: form.salary_min.trim() ? Number(form.salary_min) : null,
        salary_max: form.salary_max.trim() ? Number(form.salary_max) : null,
        dealbreakers: splitCsv(form.dealbreakers),
      };

      const method = hasProfile ? "PATCH" : "POST";
      const res = await fetch("/api/client/profile", {
        method,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const result = (await res.json()) as ProfileResponse;
      if (!res.ok || !result.ok) {
        setError(result.error ?? "Failed to save profile");
        setSaving(false);
        return;
      }

      setHasProfile(true);
      setSuccess("Profile saved");
    } catch {
      setError("Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  async function onUploadResume() {
    if (!resumeFile) {
      setError("Choose a resume file to import");
      return;
    }

    setUploadingResume(true);
    setError(null);
    setWarning(null);
    setSuccess(null);

    try {
      const {
        data: { session },
      } = await getSupabaseBrowser().auth.getSession();

      const token = session?.access_token;
      if (!token) {
        setError("Unauthorized");
        setUploadingResume(false);
        return;
      }

      const body = new FormData();
      body.append("resume", resumeFile);

      const res = await fetch("/api/client/profile/resume", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
        },
        body,
      });

      const payload = (await res.json()) as ResumeExtractionResponse;
      if (!res.ok || !payload.ok || !payload.extracted) {
        setError(payload.error ?? "Failed to interpret resume");
        return;
      }

      const extracted = payload.extracted;
      setForm((prev) => ({
        primary_role: extracted.primary_role || prev.primary_role,
        secondary_role: extracted.secondary_role || prev.secondary_role,
        career_level: extracted.career_level || prev.career_level,
        core_skills: mergeCsvStrings(prev.core_skills, extracted.core_skills),
        industry_keywords: mergeCsvStrings(prev.industry_keywords, extracted.industry_keywords),
        preferred_locations: mergeCsvStrings(prev.preferred_locations, extracted.preferred_locations),
        remote_preference: extracted.remote_preference || prev.remote_preference,
        salary_min: prev.salary_min,
        salary_max: prev.salary_max,
        dealbreakers: mergeCsvStrings(prev.dealbreakers, extracted.dealbreakers),
      }));
      setResumePreview(extracted.text_preview);
      setLatestResumeUpload(payload.resume_upload ?? null);
      if (payload.persistence_available === false) {
        setWarning(payload.warning ?? "Resume suggestions were imported, but upload history is not available yet.");
      }
      setSuccess(`Imported suggestions from ${extracted.file_name}. Review the fields, then save your profile.`);
    } catch {
      setError("Failed to interpret resume");
    } finally {
      setUploadingResume(false);
    }
  }

  if (loading) {
    return <p>Loading profile...</p>;
  }

  return (
    <section style={{ marginBottom: 24 }}>
      <h2>Profile</h2>
      <p style={{ marginTop: 0, color: "#526071", lineHeight: 1.5 }}>
        Upload a resume to draft your role targets, then review the extracted fields before saving.
      </p>
      {latestResumeUpload ? (
        <p style={{ marginTop: 0, color: "#526071", fontSize: 13, lineHeight: 1.5 }}>
          Latest import: {latestResumeUpload.file_name} on {new Date(latestResumeUpload.created_at).toLocaleString()}.
        </p>
      ) : null}
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      {warning ? <p style={{ color: "#92400e" }}>{warning}</p> : null}
      {success ? <p style={{ color: "#15803d" }}>{success}</p> : null}
      <div
        style={{
          display: "grid",
          gap: 8,
          maxWidth: 640,
          marginBottom: 16,
          padding: 14,
          border: "1px solid #dbe4f0",
          borderRadius: 12,
          background: "#f8fbff",
        }}
      >
        <input
          type="file"
          accept=".pdf,.docx,.txt,.md,.rtf"
          onChange={(event) => setResumeFile(event.target.files?.[0] ?? null)}
        />
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={onUploadResume} disabled={uploadingResume || loading}>
            {uploadingResume ? "Reading Resume..." : "Import Resume"}
          </button>
          <span style={{ color: "#64748b", fontSize: 13 }}>
            Supports PDF, DOCX, TXT, MD, and RTF up to 5MB.
          </span>
        </div>
        {resumePreview ? (
          <p style={{ margin: 0, color: "#526071", fontSize: 13, lineHeight: 1.5 }}>
            Preview: {resumePreview}
          </p>
        ) : null}
      </div>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 8, maxWidth: 640 }}>
        <input
          type="text"
          placeholder="Primary role"
          value={form.primary_role}
          onChange={(e) => setForm((prev) => ({ ...prev, primary_role: e.target.value }))}
          required
        />
        <input
          type="text"
          placeholder="Secondary role (optional)"
          value={form.secondary_role}
          onChange={(e) => setForm((prev) => ({ ...prev, secondary_role: e.target.value }))}
        />
        <select
          value={form.career_level}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, career_level: e.target.value as "" | CareerLevel }))
          }
        >
          <option value="">Career level (optional)</option>
          <option value="early">Early</option>
          <option value="mid">Mid</option>
          <option value="senior">Senior</option>
          <option value="executive">Executive</option>
        </select>
        <input
          type="text"
          placeholder="Core skills (comma-separated)"
          value={form.core_skills}
          onChange={(e) => setForm((prev) => ({ ...prev, core_skills: e.target.value }))}
        />
        <input
          type="text"
          placeholder="Industry keywords (comma-separated)"
          value={form.industry_keywords}
          onChange={(e) => setForm((prev) => ({ ...prev, industry_keywords: e.target.value }))}
        />
        <input
          type="text"
          placeholder="Preferred locations (comma-separated)"
          value={form.preferred_locations}
          onChange={(e) => setForm((prev) => ({ ...prev, preferred_locations: e.target.value }))}
        />
        <select
          value={form.remote_preference}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              remote_preference: e.target.value as RemotePreference,
            }))
          }
        >
          <option value="remote">Remote</option>
          <option value="hybrid">Hybrid</option>
          <option value="onsite">Onsite</option>
          <option value="all">All</option>
        </select>
        <input
          type="number"
          placeholder="Salary min"
          value={form.salary_min}
          onChange={(e) => setForm((prev) => ({ ...prev, salary_min: e.target.value }))}
        />
        <input
          type="number"
          placeholder="Salary max"
          value={form.salary_max}
          onChange={(e) => setForm((prev) => ({ ...prev, salary_max: e.target.value }))}
        />
        <input
          type="text"
          placeholder="Dealbreakers (comma-separated)"
          value={form.dealbreakers}
          onChange={(e) => setForm((prev) => ({ ...prev, dealbreakers: e.target.value }))}
        />
        <button type="submit" disabled={saving} style={{ width: "fit-content" }}>
          {saving ? "Saving..." : hasProfile ? "Update Profile" : "Create Profile"}
        </button>
      </form>
    </section>
  );
}
