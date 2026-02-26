import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ClientProfileForm } from "@/components/ClientProfileForm";
import { ClientJobsTable } from "@/components/ClientJobsTable";
import { createServerClient } from "@/lib/supabase/server";

export default async function ClientPage() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("sb-access-token")?.value ?? "";

  if (!accessToken) {
    redirect("/login");
  }

  const authorization = `Bearer ${accessToken}`;
  const supabase = createServerClient({ authorization });
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    redirect("/login");
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Client Dashboard</h1>
      <ClientProfileForm />
      <ClientJobsTable />
    </main>
  );
}
