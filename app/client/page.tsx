import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import ClientDashboard from "@/components/ClientDashboard";

export default async function ClientPage() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("sb-access-token")?.value;

  if (!accessToken) {
    redirect("/login");
  }

  return <ClientDashboard />;
}
