import { useEffect, useState } from "react";
import { Store } from "@tauri-apps/plugin-store";

type UsageMap = Record<string, { count: number; lastUsedAt: number }>;

// score decays roughly by half every ~24h of disuse, so both frequently and
// recently used items float to the top without needing separate sort modes
function score(entry: { count: number; lastUsedAt: number } | undefined): number {
  if (!entry) return 0;
  const hoursSince = (Date.now() - entry.lastUsedAt) / 3_600_000;
  return entry.count / (1 + hoursSince / 24);
}

export function usePaletteUsage() {
  const [store, setStore] = useState<Store | null>(null);
  const [usage, setUsage] = useState<UsageMap>({});

  useEffect(() => {
    Store.load("command-palette-usage.json").then(async (s) => {
      setStore(s);
      setUsage((await s.get<UsageMap>("usage").catch(() => null)) ?? {});
    });
  }, []);

  const recordUsage = (id: string) => {
    setUsage((prev) => {
      const existing = prev[id];
      const updated: UsageMap = { ...prev, [id]: { count: (existing?.count ?? 0) + 1, lastUsedAt: Date.now() } };
      store?.set("usage", updated).then(() => store.save());
      return updated;
    });
  };

  const scoreOf = (id: string) => score(usage[id]);

  return { recordUsage, scoreOf };
}
