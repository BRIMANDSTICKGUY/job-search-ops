import { getCoachSupabase } from "@/lib/supabase/coach";
import { assignJobToClientFromForm, updateJobLane } from "./actions";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { RunGreenhouseScrapeButton } from "@/components/RunGreenhouseScrapeButton";
import { IngestRunsTable } from "@/components/IngestRunsTable";
import { IngestRunJobsTable } from "@/components/IngestRunJobsTable";
import { getCoachSession } from "@/lib/auth/coach";

const PAGE_SIZE = 12;

const shellStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(180deg, #f4f7fb 0%, #eef3f8 100%)",
  padding: "32px 24px 64px",
  color: "#0f172a",
};

const containerStyle: React.CSSProperties = {
  maxWidth: 1180,
  margin: "0 auto",
};

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #dbe4f0",
  borderRadius: 20,
  boxShadow: "0 16px 40px rgba(15, 23, 42, 0.06)",
  padding: 24,
};

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 22,
  fontWeight: 700,
  letterSpacing: "-0.02em",
};

const mutedTextStyle: React.CSSProperties = {
  margin: 0,
  color: "#526071",
  fontSize: 14,
  lineHeight: 1.5,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 13px",
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  background: "#fff",
  fontSize: 14,
  color: "#0f172a",
  boxSizing: "border-box",
};

const primaryButtonStyle: React.CSSProperties = {
  border: "none",
  borderRadius: 12,
  background: "#0f172a",
  color: "#fff",
  padding: "11px 16px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 12,
  background: "#fff",
  color: "#0f172a",
  padding: "9px 14px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const tabListStyle: React.CSSProperties = {
  display: "inline-flex",
  gap: 10,
  padding: 6,
  borderRadius: 16,
  background: "#eaf0f7",
  border: "1px solid #d7e0eb",
  flexWrap: "wrap",
};

const tabLinkBaseStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 14px",
  borderRadius: 12,
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 700,
};

const operationsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 16,
};

const utilityPanelStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  padding: 18,
  background: "#fbfdff",
};

const sectionEyebrowStyle: React.CSSProperties = {
  margin: "0 0 8px",
  color: "#64748b",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

type PagerProps = {
  currentPage: number;
  totalPages: number;
  previousHref: string | null;
  nextHref: string | null;
  label: string;
};

function parsePageParam(value: string | null | undefined): number {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function buildCoachHref(
  params: URLSearchParams,
  updates: Record<string, string | null>
): string {
  const nextParams = new URLSearchParams(params);
  for (const [key, value] of Object.entries(updates)) {
    if (!value || value === "1") {
      nextParams.delete(key);
      continue;
    }
    nextParams.set(key, value);
  }
  const query = nextParams.toString();
  return query ? `/coach?${query}` : "/coach";
}

function renderPager({ currentPage, totalPages, previousHref, nextHref, label }: PagerProps) {
  if (totalPages <= 1) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginTop: 18,
        flexWrap: "wrap",
      }}
    >
      <p style={mutedTextStyle}>
        {label} page {currentPage} of {totalPages}
      </p>
      <div style={{ display: "flex", gap: 10 }}>
        {previousHref ? (
          <a href={previousHref} style={secondaryButtonStyle}>
            Previous
          </a>
        ) : (
          <span style={{ ...secondaryButtonStyle, opacity: 0.45, cursor: "default" }}>Previous</span>
        )}
        {nextHref ? (
          <a href={nextHref} style={secondaryButtonStyle}>
            Next
          </a>
        ) : (
          <span style={{ ...secondaryButtonStyle, opacity: 0.45, cursor: "default" }}>Next</span>
        )}
      </div>
    </div>
  );
}

type CoachJob = {
  id: string;
  title: string;
  company: string;
  lane: string;
  client_status: string | null;
};

type UnassignedJob = {
  id: string;
  title: string;
  company: string;
  link: string | null;
};

type CoachClient = {
  id: string;
  name: string;
  auth_user_id: string | null;
};

type IngestRun = {
  id: string;
  source: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  job_count: number;
  error_message: string | null;
  metadata: {
    fetched?: number;
    inserted?: number;
    duplicates?: number;
    archived?: number;
    source_summaries?: Array<{
      source_id?: string;
      source_type?: string;
      company_name?: string | null;
      client_id?: string | null;
      fetched?: number;
      inserted?: number;
      duplicates?: number;
      archived?: number;
      skipped_no_profiles?: boolean;
    }>;
  } | null;
};

type JobAssignmentRow = {
  job_id: string;
};

type CoachPageProps = {
  searchParams?: Promise<{
    manual_error?: string | string[];
    manual_success?: string | string[];
    run_id?: string | string[];
    assigned_page?: string | string[];
    intake_page?: string | string[];
    tab?: string | string[];
  }>;
};

export default async function CoachPage({ searchParams }: CoachPageProps) {
  const { user, isCoach } = await getCoachSession();

  if (!user) {
    redirect("/login");
  }

  if (!isCoach) {
    redirect("/client");
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const manualErrorParam = resolvedSearchParams?.manual_error;
  const manualSuccessParam = resolvedSearchParams?.manual_success;
  const runIdParam = resolvedSearchParams?.run_id;
  const assignedPageParam = resolvedSearchParams?.assigned_page;
  const intakePageParam = resolvedSearchParams?.intake_page;
  const tabParam = resolvedSearchParams?.tab;
  const manualError =
    typeof manualErrorParam === "string"
      ? manualErrorParam
      : Array.isArray(manualErrorParam)
        ? manualErrorParam[0] ?? null
        : null;
  const manualSuccess =
    (typeof manualSuccessParam === "string" && manualSuccessParam === "1") ||
    (Array.isArray(manualSuccessParam) && manualSuccessParam.includes("1"));
  const selectedRunId =
    typeof runIdParam === "string"
      ? runIdParam
      : Array.isArray(runIdParam)
        ? runIdParam[0] ?? null
        : null;
  const currentAssignedPage = parsePageParam(
    typeof assignedPageParam === "string"
      ? assignedPageParam
      : Array.isArray(assignedPageParam)
        ? assignedPageParam[0]
        : null
  );
  const currentIntakePage = parsePageParam(
    typeof intakePageParam === "string"
      ? intakePageParam
      : Array.isArray(intakePageParam)
        ? intakePageParam[0]
        : null
  );
  const activeTabValue =
    typeof tabParam === "string"
      ? tabParam
      : Array.isArray(tabParam)
        ? tabParam[0] ?? null
        : null;
  const activeTab = activeTabValue === "assigned" ? "assigned" : "intake";
  const coachSearchParams = new URLSearchParams();

  if (selectedRunId) coachSearchParams.set("run_id", selectedRunId);
  if (manualSuccess) coachSearchParams.set("manual_success", "1");
  if (manualError) coachSearchParams.set("manual_error", manualError);
  if (activeTab === "assigned") coachSearchParams.set("tab", "assigned");

  const supabase = getCoachSupabase();
  if (!supabase) {
    console.error("Coach Supabase client unavailable; check server env.");
    return (
      <main style={{ padding: "24px" }}>
        <h1>Coach dashboard unavailable</h1>
        <p>Supabase is not configured for this environment.</p>
      </main>
    );
  }

  const { data: assignedJobRows, error } = await supabase
    .from("job_assignments")
    .select("job_id");

  const assignedJobIdList = Array.from(
    new Set(((assignedJobRows ?? []) as JobAssignmentRow[]).map((row) => row.job_id).filter(Boolean))
  );

  const { data: allJobs, error: allJobsError } = await supabase
    .from("jobs")
    .select("id, title, company, link, lane, client_status")
    .eq("is_test", false)
    .eq("source_active", true);

  const { data: clients, error: clientsError } = await supabase
    .from("clients")
    .select("id, name, auth_user_id")
    .order("name", { ascending: true });

  const { data: ingestRuns, error: ingestRunsError } = await supabase
    .from("ingest_runs")
    .select("id, source, status, started_at, finished_at, job_count, error_message, metadata")
    .order("started_at", { ascending: false })
    .limit(20);

  const coachQueryErrorMessage =
    error?.message ??
    allJobsError?.message ??
    clientsError?.message ??
    ingestRunsError?.message ??
    null;

  if (coachQueryErrorMessage) {
    // Local dev should keep the page usable even if some Supabase-backed queries fail.
    console.warn("Coach dashboard query failed", {
      jobsError: error?.message ?? null,
      unassignedJobsError: allJobsError?.message ?? null,
      clientsError: clientsError?.message ?? null,
      ingestRunsError: ingestRunsError?.message ?? null,
    });
  }

  const typedAllJobs = (allJobs ?? []) as Array<CoachJob & UnassignedJob>;
  const typedIngestRuns = (ingestRuns ?? []) as IngestRun[];
  const latestLiveIngestRun = typedIngestRuns.find((run) => run.source === "live_sources" && run.metadata);
  const assignedJobIds = new Set(assignedJobIdList);
  const typedJobs: CoachJob[] = typedAllJobs
    .filter((job) => assignedJobIds.has(job.id))
    .sort((left, right) => left.company.localeCompare(right.company) || left.title.localeCompare(right.title));
  const typedUnassignedJobs = typedAllJobs
    .filter((job) => !assignedJobIds.has(job.id))
    .sort((left, right) => left.company.localeCompare(right.company) || left.title.localeCompare(right.title));
  const totalAssignedPages = Math.max(1, Math.ceil(typedJobs.length / PAGE_SIZE));
  const totalIntakePages = Math.max(1, Math.ceil(typedUnassignedJobs.length / PAGE_SIZE));
  const assignedPage = Math.min(currentAssignedPage, totalAssignedPages);
  const intakePage = Math.min(currentIntakePage, totalIntakePages);
  const paginatedAssignedJobs = typedJobs.slice(
    (assignedPage - 1) * PAGE_SIZE,
    assignedPage * PAGE_SIZE
  );
  const paginatedIntakeJobs = typedUnassignedJobs.slice(
    (intakePage - 1) * PAGE_SIZE,
    intakePage * PAGE_SIZE
  );
  const typedClients = (clients ?? []) as CoachClient[];
  const LANES = ["INBOX", "VERIFIED", "CLIENT-SENT", "WATCHLIST", "REJECTED"];
  const assignedPreviousHref =
    assignedPage > 1
      ? buildCoachHref(coachSearchParams, { assigned_page: String(assignedPage - 1), intake_page: String(intakePage) })
      : null;
  const assignedNextHref =
    assignedPage < totalAssignedPages
      ? buildCoachHref(coachSearchParams, { assigned_page: String(assignedPage + 1), intake_page: String(intakePage) })
      : null;
  const intakePreviousHref =
    intakePage > 1
      ? buildCoachHref(coachSearchParams, { assigned_page: String(assignedPage), intake_page: String(intakePage - 1) })
      : null;
  const intakeNextHref =
    intakePage < totalIntakePages
      ? buildCoachHref(coachSearchParams, { assigned_page: String(assignedPage), intake_page: String(intakePage + 1) })
      : null;
  const intakeTabHref = buildCoachHref(coachSearchParams, {
    tab: null,
    assigned_page: String(assignedPage),
    intake_page: String(intakePage),
  });
  const assignedTabHref = buildCoachHref(coachSearchParams, {
    tab: "assigned",
    assigned_page: String(assignedPage),
    intake_page: String(intakePage),
  });
  const queueTabs = [
    { key: "intake", label: "Intake Queue", count: typedUnassignedJobs.length, href: intakeTabHref },
    { key: "assigned", label: "Assigned Jobs", count: typedJobs.length, href: assignedTabHref },
  ] as const;

  async function submitManualIntake(formData: FormData) {
    "use server";

    const title = formData.get("title");
    const company = formData.get("company");
    const link = formData.get("link");

    if (typeof title !== "string" || typeof company !== "string") {
      redirect("/coach?manual_error=Missing+required+fields");
    }

    const trimmedTitle = title.trim();
    const trimmedCompany = company.trim();
    const trimmedLink =
      typeof link === "string" && link.trim().length > 0 ? link.trim() : null;

    if (!trimmedTitle || !trimmedCompany) {
      redirect("/coach?manual_error=Missing+required+fields");
    }

    const requestHeaders = await headers();
    const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
    const proto = requestHeaders.get("x-forwarded-proto") ?? "http";

    if (!host) {
      redirect("/coach?manual_error=Unable+to+resolve+request+host");
    }

    const response = await fetch(`${proto}://${host}/api/ingest/manual`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: trimmedTitle,
        company: trimmedCompany,
        link: trimmedLink,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      let message = "Failed to add job to intake";
      try {
        const payload = (await response.json()) as { error?: unknown };
        if (typeof payload?.error === "string" && payload.error.trim()) {
          message = payload.error.trim();
        }
      } catch {}
      redirect(`/coach?manual_error=${encodeURIComponent(message)}`);
    }

    revalidatePath("/coach");
    redirect("/coach?manual_success=1");
  }

  return (
    <main style={shellStyle}>
      <div style={containerStyle}>
        <section
          style={{
            ...cardStyle,
            marginBottom: 24,
            background: "linear-gradient(135deg, #ffffff 0%, #f6f9fc 62%, #eef6ff 100%)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <p style={{ ...mutedTextStyle, letterSpacing: "0.08em", textTransform: "uppercase", fontSize: 12 }}>
                Coach workspace
              </p>
              <h1 style={{ margin: "8px 0 10px", fontSize: 36, lineHeight: 1.05, letterSpacing: "-0.04em" }}>
                Job Search Ops Coach Dashboard
              </h1>
              <p style={{ ...mutedTextStyle, maxWidth: 700 }}>
                Review intake, assign jobs to clients, and monitor ingestion runs without loading the full backlog into one giant page.
              </p>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(120px, 1fr))",
                gap: 12,
                alignSelf: "stretch",
                minWidth: 280,
                flex: "1 1 320px",
              }}
            >
              {[
                ["Assigned jobs", String(typedJobs.length)],
                ["Intake jobs", String(typedUnassignedJobs.length)],
                ["Clients", String(typedClients.length)],
              ].map(([label, value]) => (
                <div key={label} style={{ background: "rgba(255,255,255,0.72)", border: "1px solid #d8e2ee", borderRadius: 16, padding: 16 }}>
                  <div style={{ fontSize: 12, color: "#526071", marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

      {coachQueryErrorMessage ? (
        <div
          style={{
            ...cardStyle,
            marginBottom: 24,
            padding: 16,
            border: "1px solid #f59e0b",
            background: "#fffbeb",
            color: "#92400e",
          }}
        >
          <strong>Local data warning:</strong> {coachQueryErrorMessage}
        </div>
      ) : null}

      <section style={{ ...cardStyle, marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
          <div>
            <h2 style={sectionTitleStyle}>Operations</h2>
            <p style={mutedTextStyle}>Keep manual intake and scraper controls in one place, then use the queue tabs below to focus on a single workflow.</p>
          </div>
        </div>
        <div style={operationsGridStyle}>
          <div style={utilityPanelStyle}>
            <p style={sectionEyebrowStyle}>Manual Intake</p>
            <h3 style={{ margin: "0 0 8px", fontSize: 20 }}>Add a role to intake</h3>
            <p style={{ ...mutedTextStyle, marginBottom: 14 }}>New jobs entered here start in the intake queue and can be assigned below.</p>
            {manualSuccess ? (
              <p style={{ color: "#15803d", fontSize: 13, marginBottom: 10 }}>Job added to intake</p>
            ) : null}
            <p
              id="manual-intake-error"
              style={{
                color: "#b91c1c",
                fontSize: 13,
                marginBottom: 10,
                display: manualError ? "block" : "none",
              }}
            >
              {manualError ?? ""}
            </p>
            <form
              id="manual-intake-form"
              action={submitManualIntake}
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              }}
            >
              <input id="manual-intake-title" type="text" name="title" placeholder="Title" required style={inputStyle} />
              <input
                id="manual-intake-company"
                type="text"
                name="company"
                placeholder="Company"
                required
                style={inputStyle}
              />
              <input id="manual-intake-link" type="text" name="link" placeholder="Link (optional)" style={inputStyle} />
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <button id="manual-intake-submit" type="submit" style={primaryButtonStyle}>
                  Add to Intake
                </button>
              </div>
            </form>
          </div>

          <div style={utilityPanelStyle}>
            <p style={sectionEyebrowStyle}>Scrapers</p>
            <h3 style={{ margin: "0 0 8px", fontSize: 20 }}>Run live source ingest or the Greenhouse stub</h3>
            <p style={{ ...mutedTextStyle, marginBottom: 14 }}>Manually run all active Greenhouse, Lever, Ashby, and Workday sources from ingestion settings, or use the Greenhouse stub for a quick diagnostic pass. Review the latest run state in the table below and open a run source to inspect the jobs it touched.</p>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <RunGreenhouseScrapeButton />
            </div>
          </div>
        </div>
      </section>

      <section style={{ ...cardStyle, marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
          <div>
            <h2 style={sectionTitleStyle}>Recent Ingest Runs</h2>
            <p style={mutedTextStyle}>Track scraper health, retry failed runs, and open a run to inspect the jobs attached to it.</p>
          </div>
        </div>
        {latestLiveIngestRun?.metadata ? (
          <div
            style={{
              border: "1px solid #dbe4f0",
              borderRadius: 18,
              padding: 18,
              background: "#f8fafc",
              display: "grid",
              gap: 14,
              marginBottom: 18,
            }}
          >
            <div style={{ display: "grid", gap: 6 }}>
              <p style={sectionEyebrowStyle}>Latest Live Ingest Summary</p>
              <h3 style={{ margin: 0, fontSize: 20 }}>Persisted source breakdown</h3>
              <p style={mutedTextStyle}>
                Last updated {new Date(latestLiveIngestRun.started_at).toLocaleString()} with status {latestLiveIngestRun.status}.
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
              {[
                ["Fetched", String(latestLiveIngestRun.metadata.fetched ?? 0)],
                ["Inserted", String(latestLiveIngestRun.metadata.inserted ?? 0)],
                ["Duplicates", String(latestLiveIngestRun.metadata.duplicates ?? 0)],
                ["Archived", String(latestLiveIngestRun.metadata.archived ?? 0)],
              ].map(([label, value]) => (
                <div key={label} style={{ background: "#ffffff", border: "1px solid #dbe4f0", borderRadius: 14, padding: 14 }}>
                  <div style={{ fontSize: 12, color: "#526071", marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.03em" }}>{value}</div>
                </div>
              ))}
            </div>
            {latestLiveIngestRun.metadata.source_summaries?.length ? (
              <div style={{ display: "grid", gap: 8 }}>
                {latestLiveIngestRun.metadata.source_summaries.map((summary) => {
                  const label = summary.company_name?.trim() || summary.source_type || summary.source_id || "source";
                  return (
                    <div
                      key={`${summary.source_id ?? label}`}
                      style={{
                        display: "grid",
                        gap: 4,
                        padding: "10px 12px",
                        border: "1px solid #dbe4f0",
                        borderRadius: 12,
                        background: "#ffffff",
                        fontSize: 13,
                      }}
                    >
                      <strong style={{ color: "#0f172a" }}>
                        {label} {summary.source_type ? `(${summary.source_type})` : ""}
                      </strong>
                      <span style={{ color: "#526071" }}>
                        Fetched {summary.fetched ?? 0}, inserted {summary.inserted ?? 0}, duplicates {summary.duplicates ?? 0}, archived {summary.archived ?? 0}
                        {summary.skipped_no_profiles ? ", skipped because the client has no job profile" : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}
        <IngestRunsTable />
        {selectedRunId ? <div style={{ marginTop: 18 }}><IngestRunJobsTable runId={selectedRunId} /></div> : null}
      </section>

      {activeTab === "intake" ? (
      <section style={{ ...cardStyle, marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
          <div>
            <p style={sectionEyebrowStyle}>Queue View</p>
            <h2 style={sectionTitleStyle}>Intake Queue</h2>
            <p style={mutedTextStyle}>Assign incoming roles in batches with paged results so the queue stays fast to review.</p>
          </div>
          <div style={{ display: "grid", gap: 10, justifyItems: "start" }}>
            <nav aria-label="Coach queue views" style={tabListStyle}>
              {queueTabs.map((tab) => {
                const isActive = activeTab === tab.key;

                return (
                  <a
                    key={tab.key}
                    href={tab.href}
                    aria-current={isActive ? "page" : undefined}
                    style={{
                      ...tabLinkBaseStyle,
                      background: isActive ? "#ffffff" : "transparent",
                      color: isActive ? "#0f172a" : "#526071",
                      boxShadow: isActive ? "0 8px 18px rgba(15, 23, 42, 0.08)" : "none",
                    }}
                  >
                    <span>{tab.label}</span>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: 28,
                        height: 28,
                        padding: "0 8px",
                        borderRadius: 999,
                        background: isActive ? "#dbeafe" : "#d8e2ee",
                        color: isActive ? "#1d4ed8" : "#334155",
                        fontSize: 12,
                      }}
                    >
                      {tab.count}
                    </span>
                  </a>
                );
              })}
            </nav>
            <div style={{ ...mutedTextStyle, fontWeight: 600 }}>{typedUnassignedJobs.length} roles awaiting assignment</div>
          </div>
        </div>
        {paginatedIntakeJobs.length === 0 ? (
          <p>No unassigned jobs.</p>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {paginatedIntakeJobs.map((job) => (
              <article key={job.id} style={{ border: "1px solid #e2e8f0", borderRadius: 18, padding: 18, background: "#fdfefe" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 18 }}>{job.title}</h3>
                    <p style={{ ...mutedTextStyle, marginTop: 4 }}>{job.company}</p>
                  </div>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minHeight: 24,
                      fontSize: 11,
                      letterSpacing: 0.6,
                      textTransform: "uppercase",
                      padding: "2px 8px",
                      lineHeight: 1,
                      borderRadius: 999,
                      border: "1px solid #d1d5db",
                      background: "#f9fafb",
                      color: "#4b5563",
                    }}
                  >
                    Intake
                  </span>
                </div>
                {job.link ? (
                  <p style={{ marginTop: 0 }}>
                    <a href={job.link} target="_blank" rel="noreferrer" style={{ color: "#2563eb", fontWeight: 600 }}>
                      View job posting
                    </a>
                  </p>
                ) : null}
                <form
                  action={assignJobToClientFromForm.bind(null, job.id)}
                  style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}
                >
                  <select name="clientId" defaultValue="" required style={{ ...inputStyle, width: 240 }}>
                    <option value="" disabled>
                      Select a client
                    </option>
                    {typedClients.map((client) => (
                      <option key={client.id} value={client.auth_user_id ?? client.id}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                  <button type="submit" style={primaryButtonStyle}>Assign</button>
                </form>
              </article>
            ))}
          </div>
        )}
        {renderPager({ currentPage: intakePage, totalPages: totalIntakePages, previousHref: intakePreviousHref, nextHref: intakeNextHref, label: "Intake queue" })}
      </section>
      ) : null}

      {activeTab === "assigned" ? (
      <section style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
          <div>
            <p style={sectionEyebrowStyle}>Queue View</p>
            <h2 style={sectionTitleStyle}>Assigned Jobs</h2>
            <p style={mutedTextStyle}>Review the assigned backlog in smaller pages and move roles through lanes without flooding the browser.</p>
          </div>
          <div style={{ display: "grid", gap: 10, justifyItems: "start" }}>
            <nav aria-label="Coach queue views" style={tabListStyle}>
              {queueTabs.map((tab) => {
                const isActive = activeTab === tab.key;

                return (
                  <a
                    key={tab.key}
                    href={tab.href}
                    aria-current={isActive ? "page" : undefined}
                    style={{
                      ...tabLinkBaseStyle,
                      background: isActive ? "#ffffff" : "transparent",
                      color: isActive ? "#0f172a" : "#526071",
                      boxShadow: isActive ? "0 8px 18px rgba(15, 23, 42, 0.08)" : "none",
                    }}
                  >
                    <span>{tab.label}</span>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: 28,
                        height: 28,
                        padding: "0 8px",
                        borderRadius: 999,
                        background: isActive ? "#dbeafe" : "#d8e2ee",
                        color: isActive ? "#1d4ed8" : "#334155",
                        fontSize: 12,
                      }}
                    >
                      {tab.count}
                    </span>
                  </a>
                );
              })}
            </nav>
            <div style={{ ...mutedTextStyle, fontWeight: 600 }}>{typedJobs.length} assigned roles</div>
          </div>
        </div>
        {paginatedAssignedJobs.length === 0 ? <p style={mutedTextStyle}>No assigned jobs yet.</p> : null}
        {paginatedAssignedJobs.map((job) => (
        <article key={job.id} style={{ marginBottom: 16, border: "1px solid #e2e8f0", borderRadius: 18, padding: 18, background: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 18 }}>
                {job.title}
              </h3>
              <p style={{ ...mutedTextStyle, marginTop: 4 }}>{job.company}</p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", padding: "6px 10px", borderRadius: 999, background: "#e2e8f0", fontSize: 12, fontWeight: 700, color: "#334155" }}>
                Lane: {job.lane ?? "—"}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", padding: "6px 10px", borderRadius: 999, background: "#eff6ff", fontSize: 12, fontWeight: 700, color: "#1d4ed8" }}>
                Status: {job.client_status ?? "—"}
              </span>
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#6b7280", margin: "10px 0 12px" }}>
            Coach-controlled: used to organize the job search
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {LANES.map((lane) => (
              <form
                key={lane}
                action={async () => {
                  "use server";
                  await updateJobLane(job.id, lane);
                }}
              >
                <button type="submit" style={secondaryButtonStyle}>{lane}</button>
              </form>
            ))}
          </div>
        </article>
      ))}
        {renderPager({ currentPage: assignedPage, totalPages: totalAssignedPages, previousHref: assignedPreviousHref, nextHref: assignedNextHref, label: "Assigned jobs" })}
      </section>
      ) : null}
      </div>
    </main>
  );
}
