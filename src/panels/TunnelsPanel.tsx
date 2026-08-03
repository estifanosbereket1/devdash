import { Flyout, FlyoutRow, FlyoutButton } from "../Flyout";
import type { TunnelInfo } from "../types";

export function TunnelsPanel({ tunnels, error }: { tunnels: TunnelInfo[]; error: string | null }) {
  return (
    <Flyout>
      {error && <p style={{ color: "#f87171", fontSize: 12, marginBottom: 8 }}>{error}</p>}
      {tunnels.length === 0 && !error && (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", padding: "4px 0" }}>
          No tunnels running — start ngrok or cloudflared and it'll show up here within a few seconds.
        </div>
      )}
      {tunnels.map((t, i) => (
        <FlyoutRow
          key={`${t.provider}-${i}`}
          title={t.public_url ?? `${t.provider} — no public URL`}
          subtitle={t.local_addr ? `→ ${t.local_addr}` : t.status}
          status={t.proto ?? t.provider}
          statusColor="#5eead4"
          actions={t.public_url ? (
            <FlyoutButton onClick={() => navigator.clipboard.writeText(t.public_url!)}>copy</FlyoutButton>
          ) : undefined}
        />
      ))}
    </Flyout>
  );
}
