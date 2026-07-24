import { Flyout, FlyoutRow, FlyoutButton } from "../Flyout";
import type { BloatEntry } from "../types";

type Props = { entries: BloatEntry[]; scan: () => void; scanning: boolean; prune: (path: string, label: string) => void; busy: string | null };

export function BloatPanel({ entries, scan, scanning, prune, busy }: Props) {
  return (
    <Flyout>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
          {entries.length > 0 ? `${(entries.reduce((sum, e) => sum + e.size_mb, 0) / 1000).toFixed(1)} GB reclaimable` : "Not scanned yet"}
        </span>
        <FlyoutButton onClick={scan} disabled={scanning}>{scanning ? "scanning..." : "scan"}</FlyoutButton>
      </div>
      {entries.map((e) => (
        <FlyoutRow
          key={e.path}
          title={`${e.project_name} / ${e.folder_name}`}
          subtitle={`${e.size_mb.toFixed(0)} MB`}
          actions={<FlyoutButton disabled={busy === e.path} onClick={() => prune(e.path, `${e.project_name}/${e.folder_name}`)}>prune</FlyoutButton>}
        />
      ))}
    </Flyout>
  );
}
