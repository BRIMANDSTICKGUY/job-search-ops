"use client";

type ClientJob = {
  id: string;
  title: string | null;
  company: string | null;
  source: string | null;
  created_at: string | null;
  client_status: string | null;
  link: string | null;
};

interface Props {
  jobs: ClientJob[];
}

export function ClientJobsTable({ jobs }: Props) {
  if (jobs.length === 0) {
    return <p>No jobs assigned yet.</p>;
  }

  return (
    <section>
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Company</th>
            <th>Source</th>
            <th>Found At</th>
            <th>Status</th>
            <th>Link</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id}>
              <td>{job.title ?? "—"}</td>
              <td>{job.company ?? "—"}</td>
              <td>{job.source ?? "—"}</td>
              <td>{job.created_at ?? "—"}</td>
              <td>{job.client_status ?? "—"}</td>
              <td>
                {job.link ? (
                  <a href={job.link} target="_blank" rel="noreferrer">
                    View
                  </a>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
