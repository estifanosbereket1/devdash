import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { TunnelInfo } from "../types";

export function useTunnels() {
  const [tunnels, setTunnels] = useState<TunnelInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    invoke<TunnelInfo[]>("list_tunnels")
      .then((t) => { setTunnels(t); setError(null); })
      .catch((e) => setError(e as string));

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, []);

  return { tunnels, error, refresh };
}
