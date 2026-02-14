import { getCoachSupabase } from "@/lib/supabase/coach";
import { assignJobToClient, updateJobLane } from "./actions";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { RunGreenhouseScrapeButton } from "@/components/RunGreenhouseScrapeButton";
import { IngestRunsTable, RetryIngestRunButton } from "@/components/IngestRunsTable";
import { IngestRunJobsTable } from "@/components/IngestRunJobsTable";

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
};

type IngestRun = {
  id: string;
  source: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  job_count: number;
  error_message: string | null;
};

type AssignedJobRow = {
  job: {
    id: string;
    title: string;
    company: string;
    lane: string;
    client_status: string | null;
  };
};

type CoachPageProps = {
  searchParams?: Promise<{
    manual_error?: string | string[];
    manual_success?: string | string[];
    run_id?: string | string[];
  }>;
};

export default async function CoachPage({ searchParams }: CoachPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const manualErrorParam = resolvedSearchParams?.manual_error;
  const manualSuccessParam = resolvedSearchParams?.manual_success;
  const runIdParam = resolvedSearchParams?.run_id;
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

  const { data: assignedJobs, error } = await supabase
    .from("job_assignments")
    .select("job:jobs(id, title, company, lane, client_status)");

  const { data: unassignedJobs, error: unassignedJobsError } = await supabase
    .from("unassigned_jobs")
    .select("id, title, company, link");

  const { data: clients, error: clientsError } = await supabase
    .from("clients")
    .select("id, name")
    .order("name", { ascending: true });

  const { data: ingestRuns, error: ingestRunsError } = await supabase
    .from("ingest_runs")
    .select("id, source, status, started_at, finished_at, job_count, error_message")
    .order("started_at", { ascending: false })
    .limit(20);

  if (error || unassignedJobsError || clientsError || ingestRunsError) {
    // Guard exists only to avoid local dev crashes; production should still surface errors in logs/monitoring.
    console.error("Coach dashboard query failed", {
      jobsError: error,
      unassignedJobsError,
      clientsError,
      ingestRunsError,
    });
    return (
      <main style={{ padding: "24px" }}>
        <h1>Coach dashboard unavailable (local)</h1>
        <p>
          {error?.message ??
            unassignedJobsError?.message ??
            clientsError?.message ??
            ingestRunsError?.message}
        </p>
        <p>Check your `.env.local` Supabase credentials.</p>
      </main>
    );
  }

  const typedJobs: CoachJob[] = ((assignedJobs ?? []) as AssignedJobRow[]).map(
    (row) => row.job
  );
  const typedUnassignedJobs = (unassignedJobs ?? []) as UnassignedJob[];
  const typedClients = (clients ?? []) as CoachClient[];
  const typedIngestRuns = (ingestRuns ?? []) as IngestRun[];
  const assignedJobIds = new Set(typedJobs.map((job) => job.id));
  const isIntakeJob = (jobId: string) => !assignedJobIds.has(jobId);
  const existingJobKeys = [
    ...typedJobs.map((job) => ({
      title: job.title.trim().toLowerCase(),
      company: job.company.trim().toLowerCase(),
    })),
    ...typedUnassignedJobs.map((job) => ({
      title: job.title.trim().toLowerCase(),
      company: job.company.trim().toLowerCase(),
    })),
  ];
  const LANES = ["INBOX", "VERIFIED", "CLIENT-SENT", "WATCHLIST", "REJECTED"];

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
    <main style={{ padding: "24px" }}>
      <h1>Coach Dashboard</h1>

      <section style={{ marginBottom: 32 }}>
        <h2>Manual Intake</h2>
        {manualSuccess ? (
          <p style={{ color: "#15803d", fontSize: 13, marginBottom: 10 }}>Job added to intake</p>
        ) : null}
        <p
          id="manual-intake-warning"
          style={{
            color: "#b45309",
            fontSize: 13,
            marginBottom: 10,
            display: "none",
          }}
        >
          A job with this title and company already exists.
        </p>
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
          style={{ display: "grid", gap: 8, maxWidth: 480 }}
        >
          <input id="manual-intake-title" type="text" name="title" placeholder="Title" required />
          <input
            id="manual-intake-company"
            type="text"
            name="company"
            placeholder="Company"
            required
          />
          <input id="manual-intake-link" type="text" name="link" placeholder="Link (optional)" />
          <button id="manual-intake-submit" type="submit" style={{ width: "fit-content" }}>
            Add to Intake
          </button>
        </form>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (() => {
                const form = document.getElementById("manual-intake-form");
                if (!form || form.dataset.bound === "1") return;
                form.dataset.bound = "1";

                const titleInput = document.getElementById("manual-intake-title");
                const companyInput = document.getElementById("manual-intake-company");
                const linkInput = document.getElementById("manual-intake-link");
                const submitButton = document.getElementById("manual-intake-submit");
                const errorEl = document.getElementById("manual-intake-error");
                const warningEl = document.getElementById("manual-intake-warning");
                const existingJobKeys = ${JSON.stringify(existingJobKeys)};

                if (!titleInput || !companyInput || !linkInput || !submitButton || !errorEl || !warningEl) return;

                const setError = (message) => {
                  if (!message) {
                    errorEl.textContent = "";
                    errorEl.style.display = "none";
                    return;
                  }
                  errorEl.textContent = message;
                  errorEl.style.display = "block";
                };

                const validate = () => {
                  const title = titleInput.value.trim();
                  const company = companyInput.value.trim();
                  const link = linkInput.value.trim();

                  if (title.length < 2) return "Title must be at least 2 characters.";
                  if (company.length < 2) return "Company must be at least 2 characters.";

                  if (link.length > 0) {
                    try {
                      const url = new URL(link);
                      if (url.protocol !== "http:" && url.protocol !== "https:") {
                        return "Link must start with http:// or https://.";
                      }
                    } catch {
                      return "Link must be a valid URL.";
                    }
                  }

                  return "";
                };

                const updateDuplicateWarning = () => {
                  const normalizedTitle = titleInput.value.trim().toLowerCase();
                  const normalizedCompany = companyInput.value.trim().toLowerCase();

                  if (!normalizedTitle || !normalizedCompany) {
                    warningEl.style.display = "none";
                    return;
                  }

                  const isDuplicate = existingJobKeys.some(
                    (job) =>
                      job.title === normalizedTitle &&
                      job.company === normalizedCompany
                  );

                  warningEl.style.display = isDuplicate ? "block" : "none";
                };

                titleInput.addEventListener("input", updateDuplicateWarning);
                companyInput.addEventListener("input", updateDuplicateWarning);
                updateDuplicateWarning();

                form.addEventListener("submit", (event) => {
                  setError("");
                  submitButton.disabled = true;

                  const error = validate();
                  if (error) {
                    event.preventDefault();
                    setError(error);
                    submitButton.disabled = false;
                    return;
                  }

                  titleInput.value = titleInput.value.trim();
                  companyInput.value = companyInput.value.trim();
                  linkInput.value = linkInput.value.trim();
                });
              })();
            `,
          }}
        />
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2>Scraper Runs</h2>
        <RunGreenhouseScrapeButton />
        <IngestRunsTable />
        <h3>Recent Ingest Runs</h3>
        <table>
          <thead>
            <tr>
              <th>Source</th>
              <th>Status</th>
              <th>Started At</th>
              <th>Finished At</th>
              <th>Job Count</th>
              <th>Error</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {typedIngestRuns.length === 0 ? (
              <tr>
                <td colSpan={7}>No ingest runs found.</td>
              </tr>
            ) : (
              typedIngestRuns.map((run) => (
                <tr key={run.id}>
                  <td>
                    <a href={`/coach?run_id=${encodeURIComponent(run.id)}`}>{run.source}</a>
                  </td>
                  <td>{run.status}</td>
                  <td>{run.started_at}</td>
                  <td>{run.finished_at ?? "—"}</td>
                  <td>{run.job_count}</td>
                  <td>{run.error_message ?? "—"}</td>
                  <td>
                    {run.status === "failed" ? (
                      <RetryIngestRunButton runId={run.id} />
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {selectedRunId ? <IngestRunJobsTable runId={selectedRunId} /> : null}
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2>Unassigned Jobs (Intake)</h2>
        {typedUnassignedJobs.length === 0 ? (
          <p>No unassigned jobs.</p>
        ) : (
          typedUnassignedJobs.map((job) => {
            const jobIsIntake = isIntakeJob(job.id);
            if (!jobIsIntake) return null;

            return (
              <div key={job.id} style={{ marginBottom: 16 }}>
                <h3>
                  {job.title} — {job.company}{" "}
                  <span
                    style={{
                      display: "inline-block",
                      fontSize: 11,
                      letterSpacing: 0.6,
                      textTransform: "uppercase",
                      padding: "2px 8px",
                      borderRadius: 999,
                      border: "1px solid #d1d5db",
                      background: "#f9fafb",
                      color: "#4b5563",
                      verticalAlign: "middle",
                    }}
                  >
                    Intake
                  </span>
                </h3>
                {job.link ? (
                  <p>
                    <a href={job.link} target="_blank" rel="noreferrer">
                      View job posting
                    </a>
                  </p>
                ) : null}
                <form
                  action={async (formData: FormData) => {
                    "use server";
                    const clientId = formData.get("clientId");
                    if (typeof clientId !== "string" || clientId.length === 0) return;
                    await assignJobToClient(job.id, clientId);
                  }}
                  style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
                >
                  <select name="clientId" defaultValue="" required>
                    <option value="" disabled>
                      Select a client
                    </option>
                    {typedClients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                  <button type="submit">Assign</button>
                </form>
              </div>
            );
          })
        )}
      </section>

      {typedJobs.map((job) => (
        <div key={job.id} style={{ marginBottom: 24 }}>
          <h3>
            {job.title} — {job.company}
          </h3>
          <p>Current Lane: {job.lane}</p>
          <p>Status: {job.client_status}</p>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
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
                <button type="submit">{lane}</button>
              </form>
            ))}
          </div>

          <hr style={{ margin: "16px 0" }} />
        </div>
      ))}
    </main>
  );
}
