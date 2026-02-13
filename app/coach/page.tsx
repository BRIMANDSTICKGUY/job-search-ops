import { getCoachSupabase } from "@/lib/supabase/coach";
import { assignJobToClient, updateJobLane } from "./actions";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

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
  searchParams?: Promise<{ manual_error?: string | string[] }>;
};

export default async function CoachPage({ searchParams }: CoachPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const manualErrorParam = resolvedSearchParams?.manual_error;
  const manualError =
    typeof manualErrorParam === "string"
      ? manualErrorParam
      : Array.isArray(manualErrorParam)
        ? manualErrorParam[0] ?? null
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

  if (error || unassignedJobsError || clientsError) {
    // Guard exists only to avoid local dev crashes; production should still surface errors in logs/monitoring.
    console.error("Coach dashboard query failed", {
      jobsError: error,
      unassignedJobsError,
      clientsError,
    });
    return (
      <main style={{ padding: "24px" }}>
        <h1>Coach dashboard unavailable (local)</h1>
        <p>{error?.message ?? unassignedJobsError?.message ?? clientsError?.message}</p>
        <p>Check your `.env.local` Supabase credentials.</p>
      </main>
    );
  }

  const typedJobs: CoachJob[] = ((assignedJobs ?? []) as AssignedJobRow[]).map(
    (row) => row.job
  );
  const typedUnassignedJobs = (unassignedJobs ?? []) as UnassignedJob[];
  const typedClients = (clients ?? []) as CoachClient[];
  const assignedJobIds = new Set(typedJobs.map((job) => job.id));
  const isIntakeJob = (jobId: string) => !assignedJobIds.has(jobId);
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
    redirect("/coach");
  }

  return (
    <main style={{ padding: "24px" }}>
      <h1>Coach Dashboard</h1>

      <section style={{ marginBottom: 32 }}>
        <h2>Manual Intake</h2>
        {manualError ? (
          <p style={{ color: "#b91c1c", fontSize: 13, marginBottom: 10 }}>{manualError}</p>
        ) : null}
        <form action={submitManualIntake} style={{ display: "grid", gap: 8, maxWidth: 480 }}>
          <input type="text" name="title" placeholder="Title" required />
          <input type="text" name="company" placeholder="Company" required />
          <input type="text" name="link" placeholder="Link (optional)" />
          <button type="submit" style={{ width: "fit-content" }}>
            Add to Intake
          </button>
        </form>
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
