import { ClientProfileForm } from "@/components/ClientProfileForm";

export default async function ClientProfilePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f4f7fb 0%, #eef3f8 100%)",
        padding: "32px 24px 64px",
        color: "#0f172a",
      }}
    >
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <section
          style={{
            background: "linear-gradient(135deg, #ffffff 0%, #f6f9fc 62%, #eef6ff 100%)",
            border: "1px solid #dbe4f0",
            borderRadius: 20,
            boxShadow: "0 16px 40px rgba(15, 23, 42, 0.06)",
            padding: 24,
            marginBottom: 20,
          }}
        >
          <p style={{ margin: "0 0 8px", color: "#64748b", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Client Profile
          </p>
          <h1 style={{ margin: "0 0 10px", fontSize: 34, lineHeight: 1.05, letterSpacing: "-0.04em" }}>
            Resume and role preferences
          </h1>
          <p style={{ margin: 0, color: "#526071", fontSize: 15, lineHeight: 1.6 }}>
            Keep your resume-derived targets, preferred locations, and search preferences in one place so coaching and matching stay aligned.
          </p>
        </section>

        <section
          style={{
            background: "#ffffff",
            border: "1px solid #dbe4f0",
            borderRadius: 20,
            boxShadow: "0 16px 40px rgba(15, 23, 42, 0.05)",
            padding: 24,
          }}
        >
          <ClientProfileForm />
        </section>
      </div>
    </main>
  );
}