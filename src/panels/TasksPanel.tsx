import { useState } from "react";
import { Flyout, FlyoutButton } from "../Flyout";
import type { Task } from "../types";

type Props = {
  tasks: Task[];
  addTask: (title: string, date: string, time: string | null) => void;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
};

function formatDueDate(date: string, time: string | null): string {
  const d = new Date(date + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d.getTime() - today.getTime()) / 86400000);

  let label: string;
  if (diffDays === 0) label = "Today";
  else if (diffDays === 1) label = "Tomorrow";
  else if (diffDays === -1) label = "Yesterday";
  else if (diffDays < 0) label = `${Math.abs(diffDays)}d overdue`;
  else label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return time ? `${label} · ${time}` : label;
}

export function TasksPanel({ tasks, addTask, toggleTask, deleteTask }: Props) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("");

  const handleAdd = () => {
    if (title.trim() === "") return;
    addTask(title.trim(), date, time || null);
    setTitle("");
    setTime("");
  };

  const sorted = [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? ""));
  });

  const inputStyle = {
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 6, color: "#e8e8e8", fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
    padding: "6px 8px",
  };

  return (
    <Flyout>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <input
          type="text" placeholder="New task..." value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          style={{ ...inputStyle, flex: 1 }}
        />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...inputStyle, colorScheme: "dark" }} />
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ ...inputStyle, colorScheme: "dark", width: 90 }} />
        <FlyoutButton onClick={handleAdd}>add</FlyoutButton>
      </div>

      {sorted.length === 0 && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>No tasks yet.</div>}

      {sorted.map((t) => (
        <div key={t.id} style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
          <div
            onClick={() => toggleTask(t.id)}
            style={{
              width: 16, height: 16, borderRadius: 4, cursor: "pointer",
              border: `1px solid ${t.completed ? "var(--accent)" : "rgba(255,255,255,0.3)"}`,
              background: t.completed ? "var(--accent)" : "transparent",
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, opacity: t.completed ? 0.4 : 1 }}>
            <div style={{ fontSize: 13, color: "#e8e8e8", textDecoration: t.completed ? "line-through" : "none" }}>{t.title}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{formatDueDate(t.date, t.time)}</div>
          </div>
          <FlyoutButton onClick={() => deleteTask(t.id)}>delete</FlyoutButton>
        </div>
      ))}
    </Flyout>
  );
}
