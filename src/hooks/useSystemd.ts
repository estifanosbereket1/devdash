import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { UnitInfo } from "../types";

export function useManagedUnits() {
  const [units, setUnits] = useState<UnitInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = () =>
    invoke<UnitInfo[]>("get_managed_units")
      .then((u) => { setUnits(u); setError(null); })
      .catch((e) => setError(e as string));

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, []);

  const act = async (name: string, action: "start_unit" | "stop_unit" | "restart_unit") => {
    setBusy(name);
    try {
      await invoke(action, { unitName: name });
      await refresh();
    } catch (e) {
      setError(e as string);
    } finally {
      setBusy(null);
    }
  };

  return { units, error, busy, act };
}
