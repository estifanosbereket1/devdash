import { Flyout, FlyoutRow } from "../Flyout";
import type { EnvRisk } from "../types";

export function SecretsPanel({ risks }: { risks: EnvRisk[] }) {
  return (
    <Flyout>
      {risks.length === 0 && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>No .env files found in scanned projects.</div>}
      {risks.map((r) => (
        <FlyoutRow
          key={r.project_path}
          title={r.project_name}
          subtitle={r.suspicious_keys.length > 0 ? `${r.suspicious_keys.length} key(s) look real: ${r.suspicious_keys.join(", ")}` : "no suspicious values detected"}
          status={r.gitignored ? "gitignored ✓" : "NOT gitignored"}
          statusColor={r.gitignored ? "#5eead4" : "#f87171"}
        />
      ))}

    </Flyout>
  );
}
