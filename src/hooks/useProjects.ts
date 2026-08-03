import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Store } from "@tauri-apps/plugin-store";
import { confirmUnless } from "../utils";
import type { ProjectInfo, GitStatus, EnvRisk, BloatEntry, EditorInfo } from "../types";

export function useProjectRoots() {
  const [roots, setRoots] = useState<string[]>([]);
  const [store, setStore] = useState<Store | null>(null);

  useEffect(() => {
    Store.load("project-roots.json").then(async (s) => {
      setStore(s);
      setRoots((await s.get<string[]>("roots")) ?? []);
    });
  }, []);

  const addRoot = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (!selected || !store) return;
    const updated = [...new Set([...roots, selected as string])];
    setRoots(updated);
    await store.set("roots", updated);
    await store.save();
  };

  const removeRoot = async (path: string) => {
    if (!store) return;
    const updated = roots.filter((r) => r !== path);
    setRoots(updated);
    await store.set("roots", updated);
    await store.save();
  };

  return { roots, addRoot, removeRoot };
}

export function useEditorPreferences() {
  const [store, setStore] = useState<Store | null>(null);
  const [prefs, setPrefs] = useState<Record<string, string>>({});

  useEffect(() => {
    Store.load("editor-preferences.json").then(async (s) => {
      setStore(s);
      setPrefs((await s.get<Record<string, string>>("prefs")) ?? {});
    });
  }, []);

  const setEditorFor = async (path: string, editor: string) => {
    if (!store) return;
    const updated = { ...prefs, [path]: editor };
    setPrefs(updated);
    await store.set("prefs", updated);
    await store.save();
  };

  return { prefs, setEditorFor };
}

export function useInstalledEditors() {
  const [editors, setEditors] = useState<EditorInfo[]>([]);

  useEffect(() => {
    invoke<EditorInfo[]>("detect_editors").then(setEditors);
  }, []);

  return editors;
}

export function useProjects(roots: string[]) {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  useEffect(() => {
    if (roots.length === 0) {
      setProjects([]);
      return;
    }
    invoke<ProjectInfo[]>("scan_projects", { roots }).then(setProjects);
  }, [roots]);
  return projects;
}

export type ComposeBusy = { path: string; action: "up" | "down" } | null;

export function useComposeActions(onDone?: () => void) {
  const [busy, setBusy] = useState<ComposeBusy>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (command: "compose_up" | "compose_down", action: "up" | "down", path: string) => {
    setBusy({ path, action });
    setError(null);
    try {
      await invoke(command, { projectPath: path });
      onDone?.();
    } catch (e) {
      setError(e as string);
    } finally {
      setBusy(null);
    }
  };

  return {
    up: (path: string) => run("compose_up", "up", path),
    down: (path: string) => run("compose_down", "down", path),
    busy,
    error,
  };
}

export function useGitStatuses(projects: ProjectInfo[]) {
  const [statuses, setStatuses] = useState<Record<string, GitStatus>>({});

  const refresh = () => {
    if (projects.length === 0) return;
    invoke<Record<string, GitStatus>>("scan_git_status", { paths: projects.map((p) => p.path) }).then(setStatuses);
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, [projects]);

  return { statuses, refresh };
}

export function useEnvRisks(projects: ProjectInfo[]) {
  const [risks, setRisks] = useState<EnvRisk[]>([]);

  const refresh = () => {
    if (projects.length === 0) return;
    invoke<EnvRisk[]>("scan_env_risks", { projects: projects.map((p) => [p.path, p.name]) }).then(setRisks);
  };

  useEffect(() => { refresh(); }, [projects]);

  return { risks, refresh };
}

export function useBloatScan(projects: ProjectInfo[], skipConfirmations: boolean) {
  const [entries, setEntries] = useState<BloatEntry[]>([]);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const scan = async () => {
    if (projects.length === 0) return;
    setScanning(true);
    try {
      setEntries(await invoke<BloatEntry[]>("scan_bloat", { projects: projects.map((p) => [p.path, p.name]) }));
    } finally {
      setScanning(false);
    }
  };

  const prune = async (path: string, label: string) => {
    const confirmed = await confirmUnless(skipConfirmations, `Delete "${label}"? This can't be undone.`, { title: "Prune folder", kind: "warning" });
    if (!confirmed) return;
    setBusy(path);
    try {
      await invoke("delete_bloat_dir", { path });
      setEntries((prev) => prev.filter((e) => e.path !== path));
    } finally {
      setBusy(null);
    }
  };

  return { entries, scan, scanning, prune, busy };
}
