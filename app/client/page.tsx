import { ClientJobsTable } from "@/components/ClientJobsTable";

export default function ClientPage() {
  return (
    <main style={{ padding: "24px" }}>
      <h1>Client Jobs</h1>
      <ClientJobsTable />
    </main>
  );
}
