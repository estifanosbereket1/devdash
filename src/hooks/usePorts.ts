import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { confirmUnless } from "../utils";
import type { PortInfo } from "../types";

export function usePorts(skipConfirmations: boolean) {
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [busy, setBusy] = useState<number | null>(null);

  const refresh = () => invoke<PortInfo[]>("list_ports").then(setPorts);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, []);

  const kill = async (pid: number, label: string) => {
    const confirmed = await confirmUnless(skipConfirmations, `Kill process on this port (${label})?`, { title: "Kill port", kind: "warning" });
    if (!confirmed) return;
    setBusy(pid);
    try {
      await invoke("kill_port", { pid });
      refresh();
    } finally {
      setBusy(null);
    }
  };

  return { ports, kill, busy, refresh };
}
