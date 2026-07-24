import { Flyout, FlyoutRow, FlyoutButton } from "../Flyout";
import type { CronJob } from "../types";

type Props = { jobs: CronJob[]; busy: string | null; remove: (job: CronJob) => void };

export function CronPanel({ jobs, busy, remove }: Props) {
  return (
    <Flyout>
      {jobs.length === 0 && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>No cron jobs found.</div>}
      {jobs.map((job) => (
        <FlyoutRow
          key={job.raw_line}
          title={job.command}
          subtitle={job.human_readable}
          status={job.schedule}
          actions={<FlyoutButton disabled={busy === job.raw_line} onClick={() => remove(job)}>delete</FlyoutButton>}
        />
      ))}
    </Flyout>
  );
}
