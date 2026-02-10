import { getCoachSupabase } from "@/lib/supabase/coach";
import { updateJobLane } from "./actions";

export default async function CoachPage() {
  const supabase = getCoachSupabase();

  const { data: jobs, error } = await supabase
    .from("jobs")
    .select("id, title, company, lane, client_status");

  if (error) {
    throw new Error(error.message);
  }

  const LANES = ["INBOX", "VERIFIED", "CLIENT-SENT", "WATCHLIST", "REJECTED"];

  return (
    <main style={{ padding: "24px" }}>
      <h1>Coach Dashboard</h1>

      {jobs?.map((job) => (
        <div key={job.id} style={{ marginBottom: 24 }}>
          <h3>
            {job.title} — {job.company}
          </h3>
          <p>Current Lane: {job.lane}</p>
          <p>Status: {job.client_status}</p>

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
