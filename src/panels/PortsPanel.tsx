import { Flyout, FlyoutRow, FlyoutButton } from "../Flyout";
import type { PortInfo } from "../types";

type Props = {
  ports: PortInfo[];
  busy: number | null;
  kill: (pid: number, label: string) => void;
  refresh: () => void;
};

export function PortsPanel({ ports, busy, kill, refresh }: Props) {
  return (
    <Flyout>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <FlyoutButton onClick={refresh}>refresh</FlyoutButton>
      </div>
      {ports.map((p) => (
        <FlyoutRow
          key={p.port}
          title={`:${p.port}`}
          subtitle={p.process ?? "unknown process"}
          status={p.protocol.toUpperCase()}
          actions={p.pid ? <FlyoutButton disabled={busy === p.pid} onClick={() => kill(p.pid!, `:${p.port} (${p.process ?? "unknown"})`)}>kill</FlyoutButton> : undefined}
        />
      ))}
    </Flyout>
  );
}
