import { redirect } from "next/navigation";
import { ClientProfileForm } from "@/components/ClientProfileForm";
import { getCoachSession } from "@/lib/auth/coach";
import { getCoachSupabase } from "@/lib/supabase/coach";
import { updateClientProgramStatusFromForm } from "@/app/coach/actions";

type CoachOnboardingClient = {
  id: string;
  name: string;
  email: string | null;
  program_status: string | null;
  auth_user_id: string | null;
  created_at?: string | null;
};

type ClientOnboardingPageProps = {
  params: Promise<{ clientId: string }>;
};

export default async function CoachClientOnboardingPage({ params }: ClientOnboardingPageProps) {
  const { user, isCoach } = await getCoachSession();

  if (!user) redirect("/coach/login");
  if (!isCoach) redirect("/client");

  const { clientId } = await params;
  const supabase = getCoachSupabase();

  if (!supabase) {
    return <main style={{ padding: 24 }}><h1>Coach dashboard unavailable</h1><p>Supabase is not configured.</p></main>;
  }

  const { data: clientRow, error } = await supabase
    .from("clients")
    .select("id, name, email, program_status, auth_user_id, created_at")
    .eq("id", clientId)
    .maybeSingle();

  const typedClientRow = (clientRow ?? null) as CoachOnboardingClient | null;

  if (error || !typedClientRow) {
    return <main style={{ padding: 24 }}><h1>Client not found</h1><p>{error?.message ?? "The requested client could not be loaded."}</p></main>;
  }

  const accessLink = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://job-search-ops.vercel.app"}/login`;

  return (
    <main style={{ minHeight: "100vh", background: "linear-gradient(180deg, #f4f7fb 0%, #eef3f8 100%)", padding: "32px 24px 64px", color: "#0f172a" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", display: "grid", gap: 20 }}>
        <section style={{ background: "linear-gradient(135deg, #ffffff 0%, #f6f9fc 62%, #eef6ff 100%)", border: "1px solid #dbe4f0", borderRadius: 20, boxShadow: "0 16px 40px rgba(15, 23, 42, 0.06)", padding: 24 }}>
          <p style={{ margin: "0 0 8px", color: "#64748b", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>Coach onboarding</p>
          <h1 style={{ margin: "0 0 10px", fontSize: 34, lineHeight: 1.05, letterSpacing: "-0.04em" }}>{typedClientRow.name}</h1>
          <p style={{ margin: 0, color: "#526071", fontSize: 15, lineHeight: 1.6 }}>Complete the resume import and profile before handing this workspace to the client.</p>
          <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            {[
              ["Client ID", typedClientRow.id],
              ["Email", typedClientRow.email ?? "—"],
              ["Program status", typedClientRow.program_status ?? "coach_onboarding"],
              ["Auth linked", typedClientRow.auth_user_id ? "Yes" : "No"],
            ].map(([label, value]) => (
              <div key={String(label)} style={{ background: "rgba(255,255,255,0.72)", border: "1px solid #d8e2ee", borderRadius: 16, padding: 16 }}>
                <div style={{ fontSize: 12, color: "#526071", marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em", wordBreak: "break-word" }}>{value}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ background: "#ffffff", border: "1px solid #dbe4f0", borderRadius: 20, boxShadow: "0 16px 40px rgba(15, 23, 42, 0.05)", padding: 24, display: "grid", gap: 16 }}>
          <div>
            <p style={{ margin: "0 0 8px", color: "#64748b", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>Client access</p>
            <h2 style={{ margin: 0, fontSize: 24, letterSpacing: "-0.03em" }}>Hand-off controls</h2>
          </div>
          <form action={updateClientProgramStatusFromForm.bind(null, typedClientRow.id)} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <select name="programStatus" defaultValue={typedClientRow.program_status ?? "coach_onboarding"} style={{ width: 260, padding: "11px 13px", borderRadius: 12, border: "1px solid #cbd5e1", background: "#fff", fontSize: 14, color: "#0f172a", boxSizing: "border-box" }}>
              <option value="coach_onboarding">Coach onboarding</option>
              <option value="ready_for_client">Ready for client</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
            </select>
            <button type="submit" style={{ border: "none", borderRadius: 12, background: "#0f172a", color: "#fff", padding: "11px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Update status</button>
          </form>
          <p style={{ margin: 0, color: "#526071", lineHeight: 1.6 }}>
            When onboarding is complete, send the client this login link: <a href={accessLink} style={{ color: "#2563eb", fontWeight: 700 }}>{accessLink}</a>
          </p>
        </section>

        <section style={{ background: "#ffffff", border: "1px solid #dbe4f0", borderRadius: 20, boxShadow: "0 16px 40px rgba(15, 23, 42, 0.05)", padding: 24 }}>
          <ClientProfileForm
            profilePath={`/api/coach/clients/${encodeURIComponent(typedClientRow.id)}/profile`}
            resumePath={`/api/coach/clients/${encodeURIComponent(typedClientRow.id)}/resume`}
            title="Coach-managed client profile"
            description="Upload the client resume, refine role targets, and prepare the profile before granting client access."
          />
        </section>
      </div>
    </main>
  );
}