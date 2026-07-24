import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { confirmUnless } from "../utils";
import type { CronJob } from "../types";

export function useCronJobs(skipConfirmations: boolean) {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = () => invoke<CronJob[]>("list_cron_jobs").then(setJobs);

  useEffect(() => { refresh(); }, []);

  const remove = async (job: CronJob) => {
    const confirmed = await confirmUnless(skipConfirmations, `Delete this cron job?\n${job.command}`, { title: "Delete cron job", kind: "warning" });
    if (!confirmed) return;
    setBusy(job.raw_line);
    try {
      await invoke("delete_cron_job", { rawLine: job.raw_line });
      refresh();
    } finally {
      setBusy(null);
    }
  };

  return { jobs, refresh, remove, busy };
}
