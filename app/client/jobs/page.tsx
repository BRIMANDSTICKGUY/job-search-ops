export default async function JobsPage() {
  const res = await fetch(
    `/api/client/jobs`,
    { cache: "no-store" }
  );

  const data = await res.json();
  const jobs = data.jobs ?? [];

  return (
    <div style={{ padding: "40px" }}>
      <h1 style={{ fontSize: "28px", marginBottom: "20px" }}>
        Job Inbox
      </h1>

      {jobs.length === 0 && (
        <p>No jobs available yet.</p>
      )}

      {jobs.length > 0 && (
        <table border="1" cellPadding="10" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th>Job Title</th>
              <th>Company</th>
              <th>Location</th>
              <th>Score</th>
              <th>Lane</th>
            </tr>
          </thead>

          <tbody>
            {jobs.map((job: any) => (
              <tr key={job.job_id}>
                <td>{job.title}</td>
                <td>{job.company}</td>
                <td>{job.location}</td>
                <td>{Number(job.fit_score)}</td>
                <td>{job.lane}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
