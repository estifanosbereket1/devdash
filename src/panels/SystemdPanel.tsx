import { Flyout, FlyoutRow, FlyoutButton } from "../Flyout";
import { displayName } from "../utils";
import type { UnitInfo } from "../types";

type Props = {
  units: UnitInfo[];
  search: string;
  onSearchChange: (v: string) => void;
  busy: string | null;
  act: (name: string, action: "start_unit" | "stop_unit" | "restart_unit") => void;
  error: string | null;
};

export function SystemdPanel({ units, search, onSearchChange, busy, act, error }: Props) {
  const filtered = units.filter((u) => {
    if (search.trim() === "") return true;
    const q = search.toLowerCase();
    return u.name.toLowerCase().includes(q) || displayName(u).toLowerCase().includes(q);
  });

  return (
    <Flyout>
      <input
        type="text"
        placeholder="Search services..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        style={{
          width: "100%", marginBottom: 8, padding: "6px 8px",
          background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 6, color: "#e8e8e8", fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
        }}
      />
      {error && <p style={{ color: "#f87171", fontSize: 12 }}>{error}</p>}
      {filtered.map((u) => (
        <FlyoutRow
          key={u.name}
          title={displayName(u)}
          subtitle={u.name}
          status={`${u.active_state} (${u.sub_state})`}
          statusColor={u.active_state === "active" ? "#5eead4" : u.active_state === "failed" ? "#f87171" : undefined}
          actions={<>
            <FlyoutButton disabled={busy === u.name} onClick={() => act(u.name, "start_unit")}>start</FlyoutButton>
            <FlyoutButton disabled={busy === u.name} onClick={() => act(u.name, "stop_unit")}>stop</FlyoutButton>
            <FlyoutButton disabled={busy === u.name} onClick={() => act(u.name, "restart_unit")}>restart</FlyoutButton>
          </>}
        />
      ))}
    </Flyout>
  );
}
