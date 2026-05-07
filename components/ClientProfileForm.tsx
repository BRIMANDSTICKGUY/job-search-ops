"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { JOB_ROLE_GROUPS, isKnownJobRole } from "@/lib/profile/jobRoleCatalog";

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

type ExtractedResumeProfile = NonNullable<ResumeExtractionResponse["extracted"]>;

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

type ToastState = {
  tone: "success" | "error";
  message: string;
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

const sectionStyle: React.CSSProperties = {
  display: "grid",
  gap: 16,
  padding: 20,
  borderRadius: 18,
  border: "1px solid #dbe4f0",
  background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
  fontSize: 13,
  fontWeight: 700,
  color: "#334155",
};

const fieldStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  minHeight: 46,
  padding: "12px 14px",
  boxSizing: "border-box",
  borderRadius: 14,
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  color: "#0f172a",
  fontSize: 14,
  outline: "none",
};

const helperStyle: React.CSSProperties = {
  margin: 0,
  color: "#64748b",
  fontSize: 12,
  lineHeight: 1.5,
};

const actionButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 44,
  padding: "0 18px",
  borderRadius: 999,
  border: "1px solid #0f172a",
  background: "#0f172a",
  color: "#ffffff",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};

const toastBaseStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 640,
  padding: "14px 16px",
  borderRadius: 16,
  boxShadow: "0 12px 24px rgba(15, 23, 42, 0.08)",
  border: "1px solid transparent",
  fontSize: 14,
  fontWeight: 700,
  lineHeight: 1.5,
};

function renderRoleOptions() {
  return JOB_ROLE_GROUPS.map((group) => (
    <optgroup key={group.label} label={group.label}>
      {group.options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </optgroup>
  ));
}

export function ClientProfileForm() {
  const roleTargetsRef = useRef<HTMLDivElement | null>(null);
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
  const [importedProfile, setImportedProfile] = useState<ExtractedResumeProfile | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_STATE);

  useEffect(() => {
    if (!toast) return;

    const timeoutId = window.setTimeout(() => {
      setToast(null);
    }, 3600);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [toast]);

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

        try {
          const resumeRes = await fetch("/api/client/profile/resume", {
            method: "GET",
            headers: { authorization: `Bearer ${token}` },
            cache: "no-store",
          });

          const resumePayload = (await resumeRes.json()) as ResumeUploadResponse;
          if (resumeRes.ok && resumePayload.ok) {
            setLatestResumeUpload(resumePayload.resume_upload ?? null);
            setResumePreview(resumePayload.resume_upload?.extracted_profile.text_preview ?? null);
            setImportedProfile(resumePayload.resume_upload?.extracted_profile ?? null);
            if (resumePayload.persistence_available === false) {
              setWarning("Resume upload history will appear after the database migration is applied. You can still import suggestions into the form now.");
            }
          } else {
            setLatestResumeUpload(null);
            setResumePreview(null);
            setImportedProfile(null);
          }
        } catch {
          if (!active) return;
          setLatestResumeUpload(null);
          setResumePreview(null);
          setImportedProfile(null);
          setWarning((currentWarning) =>
            currentWarning ?? "Your profile loaded, but resume history is temporarily unavailable."
          );
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
      setToast({ tone: "error", message: "Choose a resume file before importing." });
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
        setToast({ tone: "error", message: "Your session expired. Sign in again to import a resume." });
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

      const rawResponse = await res.text();
      let payload: ResumeExtractionResponse;

      try {
        payload = JSON.parse(rawResponse) as ResumeExtractionResponse;
      } catch {
        payload = {
          ok: false,
          error: rawResponse.trim() || `Resume upload failed with status ${res.status}`,
        };
      }

      if (!res.ok || !payload.ok || !payload.extracted) {
        setError(payload.error ?? "Failed to interpret resume");
        setToast({ tone: "error", message: payload.error ?? "Failed to interpret resume." });
        return;
      }

      const extracted = payload.extracted;
      setForm((prev) => ({
        primary_role:
          extracted.primary_role && isKnownJobRole(extracted.primary_role)
            ? extracted.primary_role
            : prev.primary_role,
        secondary_role:
          extracted.secondary_role && isKnownJobRole(extracted.secondary_role)
            ? extracted.secondary_role
            : prev.secondary_role,
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
      setImportedProfile(extracted);
      if (payload.persistence_available === false) {
        setWarning(payload.warning ?? "Resume suggestions were imported, but upload history is not available yet.");
      }
      setSuccess(`Imported suggestions from ${extracted.file_name}. Review the fields, then save your profile.`);
      setToast({
        tone: "success",
        message:
          payload.persistence_available === false
            ? `Imported ${extracted.file_name}. Suggestions are ready, but upload history will stay off until the migration is applied.`
            : `Imported ${extracted.file_name} successfully. Your profile fields are ready to review.`,
      });
          roleTargetsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      setError("Failed to interpret resume");
      setToast({ tone: "error", message: "Failed to interpret resume. Try DOCX or a text export if the file keeps failing." });
    } finally {
      setUploadingResume(false);
    }
  }

  if (loading) {
    return <p>Loading profile...</p>;
  }

  return (
    <section style={{ display: "grid", gap: 18, marginBottom: 24 }}>
      <div>
        <h2 style={{ margin: "0 0 8px", fontSize: 26, letterSpacing: "-0.03em" }}>Profile</h2>
        <p style={{ margin: 0, color: "#526071", lineHeight: 1.6 }}>
          Use your resume to draft role targets, then refine your search profile with structured job categories and clear preferences.
        </p>
      </div>
      {latestResumeUpload ? (
        <p style={{ marginTop: 0, color: "#526071", fontSize: 13, lineHeight: 1.5 }}>
          Latest import: {latestResumeUpload.file_name} on {new Date(latestResumeUpload.created_at).toLocaleString()}.
        </p>
      ) : null}
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      {warning ? <p style={{ color: "#92400e" }}>{warning}</p> : null}
      {success ? <p style={{ color: "#15803d" }}>{success}</p> : null}
      <div style={sectionStyle}>
        <div style={{ display: "grid", gap: 6 }}>
          <p style={{ margin: 0, color: "#64748b", fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Resume Import
          </p>
          <h3 style={{ margin: 0, fontSize: 20, letterSpacing: "-0.03em" }}>Parse your resume into a search profile</h3>
          <p style={{ ...helperStyle, fontSize: 13 }}>
            Upload PDF, DOCX, DOC, TXT, MD, or RTF. If a file format is difficult to parse, exporting to DOCX usually works best.
          </p>
        </div>
        <input
          type="file"
          accept=".pdf,.doc,.docx,.txt,.md,.rtf"
          style={fieldStyle}
          onChange={(event) => setResumeFile(event.target.files?.[0] ?? null)}
        />
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={onUploadResume} disabled={uploadingResume || loading} style={actionButtonStyle}>
            {uploadingResume ? "Reading Resume..." : "Import Resume"}
          </button>
          <span style={{ color: "#64748b", fontSize: 13 }}>
            Supports PDF, DOCX, DOC, TXT, MD, and RTF up to 5MB.
          </span>
        </div>
        {resumePreview ? (
          <p style={{ margin: 0, color: "#526071", fontSize: 13, lineHeight: 1.6 }}>
            Preview: {resumePreview}
          </p>
        ) : null}
      </div>
      {importedProfile ? (
        <div
          style={{
            ...sectionStyle,
            borderColor: "#bfdbfe",
            background: "linear-gradient(180deg, #f8fbff 0%, #eef6ff 100%)",
          }}
        >
          <div style={{ display: "grid", gap: 6 }}>
            <p style={{ margin: 0, color: "#1d4ed8", fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Imported Suggestions
            </p>
            <h3 style={{ margin: 0, fontSize: 20, letterSpacing: "-0.03em" }}>Review what was pulled from your resume</h3>
            <p style={{ ...helperStyle, fontSize: 13 }}>
              These values were added into the profile form below. Check them, adjust anything that looks off, then save your profile.
            </p>
          </div>
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <div style={{ display: "grid", gap: 6 }}>
              <strong style={{ fontSize: 13, color: "#334155" }}>Primary role</strong>
              <span style={{ color: "#0f172a", fontSize: 14 }}>{importedProfile.primary_role || "Not detected"}</span>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <strong style={{ fontSize: 13, color: "#334155" }}>Secondary role</strong>
              <span style={{ color: "#0f172a", fontSize: 14 }}>{importedProfile.secondary_role || "Not detected"}</span>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <strong style={{ fontSize: 13, color: "#334155" }}>Career level</strong>
              <span style={{ color: "#0f172a", fontSize: 14 }}>{importedProfile.career_level || "Not detected"}</span>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <strong style={{ fontSize: 13, color: "#334155" }}>Remote preference</strong>
              <span style={{ color: "#0f172a", fontSize: 14 }}>{importedProfile.remote_preference}</span>
            </div>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#334155" }}>Detected search terms</p>
            <p style={{ margin: 0, color: "#526071", fontSize: 14, lineHeight: 1.6 }}>
              <strong>Skills:</strong> {importedProfile.core_skills.length ? importedProfile.core_skills.join(", ") : "None detected"}
            </p>
            <p style={{ margin: 0, color: "#526071", fontSize: 14, lineHeight: 1.6 }}>
              <strong>Industries:</strong> {importedProfile.industry_keywords.length ? importedProfile.industry_keywords.join(", ") : "None detected"}
            </p>
            <p style={{ margin: 0, color: "#526071", fontSize: 14, lineHeight: 1.6 }}>
              <strong>Locations:</strong> {importedProfile.preferred_locations.length ? importedProfile.preferred_locations.join(", ") : "None detected"}
            </p>
            <p style={{ margin: 0, color: "#526071", fontSize: 14, lineHeight: 1.6 }}>
              <strong>Dealbreakers:</strong> {importedProfile.dealbreakers.length ? importedProfile.dealbreakers.join(", ") : "None detected"}
            </p>
          </div>
        </div>
      ) : null}
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 18 }}>
        <div ref={roleTargetsRef} style={sectionStyle}>
          <div style={{ display: "grid", gap: 6 }}>
            <p style={{ margin: 0, color: "#64748b", fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Role Targets
            </p>
            <h3 style={{ margin: 0, fontSize: 20, letterSpacing: "-0.03em" }}>Choose your primary and secondary job focus</h3>
          </div>
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            <label style={labelStyle}>
              Primary role
              <select
                value={form.primary_role}
                style={fieldStyle}
                onChange={(e) => setForm((prev) => ({ ...prev, primary_role: e.target.value }))}
                required
              >
                <option value="">Select a primary role</option>
                {renderRoleOptions()}
              </select>
            </label>
            <label style={labelStyle}>
              Secondary role
              <select
                value={form.secondary_role}
                style={fieldStyle}
                onChange={(e) => setForm((prev) => ({ ...prev, secondary_role: e.target.value }))}
              >
                <option value="">Select a secondary role</option>
                {renderRoleOptions()}
              </select>
            </label>
            <label style={labelStyle}>
              Career level
              <select
                value={form.career_level}
                style={fieldStyle}
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
            </label>
            <label style={labelStyle}>
              Remote preference
              <select
                value={form.remote_preference}
                style={fieldStyle}
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
            </label>
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={{ display: "grid", gap: 6 }}>
            <p style={{ margin: 0, color: "#64748b", fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Search Preferences
            </p>
            <h3 style={{ margin: 0, fontSize: 20, letterSpacing: "-0.03em" }}>Refine the roles you want to see</h3>
          </div>
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            <label style={labelStyle}>
              Core skills
              <input
                type="text"
                style={fieldStyle}
                placeholder="SQL, stakeholder management, React"
                value={form.core_skills}
                onChange={(e) => setForm((prev) => ({ ...prev, core_skills: e.target.value }))}
              />
              <p style={helperStyle}>Comma-separated skills used for role matching.</p>
            </label>
            <label style={labelStyle}>
              Industry keywords
              <input
                type="text"
                style={fieldStyle}
                placeholder="Fintech, healthcare, logistics"
                value={form.industry_keywords}
                onChange={(e) => setForm((prev) => ({ ...prev, industry_keywords: e.target.value }))}
              />
              <p style={helperStyle}>Use industries or domain themes you want prioritized.</p>
            </label>
            <label style={labelStyle}>
              Preferred locations
              <input
                type="text"
                style={fieldStyle}
                placeholder="Atlanta, Remote, Chicago"
                value={form.preferred_locations}
                onChange={(e) => setForm((prev) => ({ ...prev, preferred_locations: e.target.value }))}
              />
              <p style={helperStyle}>Comma-separated cities, regions, or “Remote”.</p>
            </label>
            <label style={labelStyle}>
              Dealbreakers
              <input
                type="text"
                style={fieldStyle}
                placeholder="No relocation, remote only"
                value={form.dealbreakers}
                onChange={(e) => setForm((prev) => ({ ...prev, dealbreakers: e.target.value }))}
              />
              <p style={helperStyle}>Any constraints the coach should respect.</p>
            </label>
            <label style={labelStyle}>
              Salary minimum
              <input
                type="number"
                style={fieldStyle}
                placeholder="90000"
                value={form.salary_min}
                onChange={(e) => setForm((prev) => ({ ...prev, salary_min: e.target.value }))}
              />
            </label>
            <label style={labelStyle}>
              Salary maximum
              <input
                type="number"
                style={fieldStyle}
                placeholder="140000"
                value={form.salary_max}
                onChange={(e) => setForm((prev) => ({ ...prev, salary_max: e.target.value }))}
              />
            </label>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-start" }}>
          <button type="submit" disabled={saving} style={actionButtonStyle}>
          {saving ? "Saving..." : hasProfile ? "Update Profile" : "Create Profile"}
        </button>
        </div>
      </form>
      <div style={{ minHeight: toast ? 0 : 0, display: toast ? "block" : "none" }}>
        {toast ? (
          <div
            role="status"
            aria-live="polite"
            style={{
              ...toastBaseStyle,
              background: toast.tone === "success" ? "#ecfdf5" : "#fef2f2",
              borderColor: toast.tone === "success" ? "#86efac" : "#fca5a5",
              color: toast.tone === "success" ? "#166534" : "#991b1b",
            }}
          >
            {toast.message}
          </div>
        ) : null}
      </div>
    </section>
  );
}
