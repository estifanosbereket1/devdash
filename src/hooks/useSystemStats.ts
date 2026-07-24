import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { MemoryInfo, BatteryInfo, DiskInfo, TempReading } from "../types";

export function useMemoryInfo() {
  const [mem, setMem] = useState<MemoryInfo | null>(null);
  useEffect(() => {
    const poll = () => invoke<MemoryInfo>("get_memory_info").then(setMem);
    poll();
    const id = setInterval(poll, 1000);
    return () => clearInterval(id);
  }, []);
  return mem;
}

export function useBatteryInfo() {
  const [battery, setBattery] = useState<BatteryInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const poll = () =>
      invoke<BatteryInfo>("get_battery_info")
        .then((b) => { setBattery(b); setError(null); })
        .catch((e) => setError(e as string));
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);
  return { battery, error };
}

export function useDiskInfo() {
  const [disks, setDisks] = useState<DiskInfo[]>([]);
  useEffect(() => {
    const poll = () => invoke<DiskInfo[]>("get_disk_info").then(setDisks);
    poll();
    const id = setInterval(poll, 10000);
    return () => clearInterval(id);
  }, []);
  return disks;
}

export function useTemperatures() {
  const [temps, setTemps] = useState<TempReading[]>([]);
  useEffect(() => {
    const poll = () => invoke<TempReading[]>("get_temperatures").then(setTemps);
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, []);
  return temps;
}
