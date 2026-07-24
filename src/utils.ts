import { confirm } from "@tauri-apps/plugin-dialog";
import type { UnitInfo } from "./types";

export async function confirmUnless(skip: boolean, message: string, options: { title: string; kind: "warning" }) {
  if (skip) return true;
  return confirm(message, options);
}

export function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function prettifyUnitName(name: string): string {
  return name
    .replace(/\.service$/, "")
    .split(/[-_.]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function displayName(unit: UnitInfo): string {
  return unit.description && unit.description.trim() !== "" ? unit.description : prettifyUnitName(unit.name);
}
