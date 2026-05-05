import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import ClientJobsInbox from "@/components/ClientJobsInbox";

export default async function JobsPage() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("sb-access-token")?.value;

  if (!accessToken) {
    redirect("/login");
  }

  return <ClientJobsInbox />;
}
