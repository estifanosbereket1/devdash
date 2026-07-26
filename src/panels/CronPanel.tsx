import { useState } from "react";
import { Flyout, FlyoutRow, FlyoutButton } from "../Flyout";
import type { CronJob } from "../types";

type Props = { jobs: CronJob[]; busy: string | null; remove: (job: CronJob) => void; addJob: (schedule: string, command: string) => void };

type ScheduleType = "every_minute" | "every_n_minutes" | "hourly" | "daily" | "weekly" | "custom";

const SCHEDULE_TYPES: { id: ScheduleType; label: string }[] = [
  { id: "every_minute", label: "Every minute" },
  { id: "every_n_minutes", label: "Every N min" },
  { id: "hourly", label: "Hourly" },
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "custom", label: "Custom" },
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function inputStyle() {
  return {
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 6, color: "#e8e8e8", fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
    padding: "6px 8px", outline: "none",
  } as const;
}

function CronForm({ onAdd }: { onAdd: (schedule: string, command: string) => void }) {
  const [type, setType] = useState<ScheduleType>("daily");
  const [interval, setInterval] = useState("5");
  const [time, setTime] = useState("09:00");
  const [weekday, setWeekday] = useState(1);
  const [customExpr, setCustomExpr] = useState("* * * * *");
  const [command, setCommand] = useState("");

  const buildSchedule = (): string => {
    const [hour, minute] = time.split(":");
    switch (type) {
      case "every_minute": return "* * * * *";
      case "every_n_minutes": return `*/${interval} * * * *`;
      case "hourly": return "0 * * * *";
      case "daily": return `${parseInt(minute)} ${parseInt(hour)} * * *`;
      case "weekly": return `${parseInt(minute)} ${parseInt(hour)} * * ${weekday}`;
      case "custom": return customExpr;
    }
  };

  const preview = buildSchedule();

  const handleAdd = () => {
    if (command.trim() === "") return;
    onAdd(preview, command.trim());
    setCommand("");
  };

  return (
    <div style={{ padding: 10, background: "rgba(255,255,255,0.03)", borderRadius: 8, marginBottom: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {SCHEDULE_TYPES.map((t) => (
          <div
            key={t.id}
            onClick={() => setType(t.id)}
            style={{
              padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11,
              background: type === t.id ? "var(--accent)22" : "rgba(255,255,255,0.05)",
              border: `1px solid ${type === t.id ? "var(--accent)" : "rgba(255,255,255,0.1)"}`,
              color: type === t.id ? "var(--accent)" : "rgba(255,255,255,0.6)",
            }}
          >
            {t.label}
          </div>
        ))}
      </div>

      {type === "every_n_minutes" && (
        <input type="number" min="1" max="59" value={interval} onChange={(e) => setInterval(e.target.value)} style={{ ...inputStyle(), width: 80, marginBottom: 8 }} />
      )}
      {(type === "daily" || type === "weekly") && (
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ ...inputStyle(), colorScheme: "dark", marginBottom: 8 }} />
      )}
      {type === "weekly" && (
        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          {WEEKDAYS.map((d, i) => (
            <div
              key={d}
              onClick={() => setWeekday(i)}
              style={{
                width: 34, textAlign: "center", padding: "4px 0", borderRadius: 6, cursor: "pointer", fontSize: 11,
                background: weekday === i ? "var(--accent)22" : "rgba(255,255,255,0.05)",
                border: `1px solid ${weekday === i ? "var(--accent)" : "rgba(255,255,255,0.1)"}`,
                color: weekday === i ? "var(--accent)" : "rgba(255,255,255,0.6)",
              }}
            >
              {d}
            </div>
          ))}
        </div>
      )}
      {type === "custom" && (
        <input
          type="text" value={customExpr} onChange={(e) => setCustomExpr(e.target.value)}
          placeholder="* * * * *" style={{ ...inputStyle(), width: "100%", marginBottom: 8 }}
        />
      )}

      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "'JetBrains Mono', monospace", marginBottom: 8 }}>
        {preview}
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <input
          type="text" value={command} onChange={(e) => setCommand(e.target.value)}
          placeholder="Command to run..." style={{ ...inputStyle(), flex: 1 }}
        />
        <FlyoutButton onClick={handleAdd}>add</FlyoutButton>
      </div>
    </div>
  );
}

export function CronPanel({ jobs, busy, remove, addJob }: Props) {
  return (
    <Flyout>
      <CronForm onAdd={addJob} />

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
