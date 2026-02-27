import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

type AssignPageProps = {
  searchParams?: Promise<{
    result?: string | string[];
  }>;
};

async function submitAssign(formData: FormData) {
  "use server";

  const clientIdRaw = formData.get("client_id");
  const jobIdRaw = formData.get("job_id");
  const client_id = typeof clientIdRaw === "string" ? clientIdRaw.trim() : "";
  const job_id = typeof jobIdRaw === "string" ? jobIdRaw.trim() : "";

  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const proto = requestHeaders.get("x-forwarded-proto") ?? "http";

  if (!host) {
    redirect(
      `/admin/assign?result=${encodeURIComponent(
        JSON.stringify({ ok: false, error: "Unable to resolve request host" })
      )}`
    );
  }

  const adminToken = process.env.ASSIGN_JOB_ADMIN_TOKEN ?? "";

  const response = await fetch(`${proto}://${host}/api/admin/assign-job`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-token": adminToken,
    },
    body: JSON.stringify({ client_id, job_id }),
    cache: "no-store",
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = { ok: false, error: "Invalid JSON response" };
  }

  const result = JSON.stringify(payload);
  redirect(`/admin/assign?result=${encodeURIComponent(result)}`);
}

export default async function AdminAssignPage({ searchParams }: AssignPageProps) {
  if (process.env.ADMIN_UI_ENABLED !== "true") {
    notFound();
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const resultParam = resolvedSearchParams?.result;
  const result =
    typeof resultParam === "string"
      ? resultParam
      : Array.isArray(resultParam)
        ? resultParam[0] ?? ""
        : "";

  return (
    <main>
      <h1>Assign Job</h1>
      <form action={submitAssign}>
        <div>
          <label htmlFor="client_id">client_id</label>
          <input id="client_id" name="client_id" type="text" required />
        </div>
        <div>
          <label htmlFor="job_id">job_id</label>
          <input id="job_id" name="job_id" type="text" required />
        </div>
        <button type="submit">Assign</button>
      </form>
      {result ? <pre>{result}</pre> : null}
    </main>
  );
}
