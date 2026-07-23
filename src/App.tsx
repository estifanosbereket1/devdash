import { useEffect, useState } from "react";
import reactLogo from "./assets/react.svg";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import "./App.css";
import { EditorPicker } from "./Flyout";
import { Plug } from "lucide-react";
import { Settings } from "lucide-react";

import { open } from "@tauri-apps/plugin-dialog";
import { Store } from "@tauri-apps/plugin-store";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { DetailPanel, Dial } from "./Dial";
import { Server, Container, FolderGit2 } from "lucide-react";
import { Flyout, FlyoutRow, FlyoutButton } from "./Flyout";

type ProjectInfo = { name: string; path: string; kind: string };

function useProjectRoots() {
  const [roots, setRoots] = useState<string[]>([]);
  const [store, setStore] = useState<Store | null>(null);

  useEffect(() => {
    Store.load("project-roots.json").then(async (s) => {
      setStore(s);
      const saved = (await s.get<string[]>("roots")) ?? [];
      setRoots(saved);
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

function useEditorPreferences() {
  const [store, setStore] = useState<Store | null>(null);
  const [prefs, setPrefs] = useState<Record<string, string>>({});

  useEffect(() => {
    Store.load("editor-preferences.json").then(async (s) => {
      setStore(s);
      const saved = (await s.get<Record<string, string>>("prefs")) ?? {};
      setPrefs(saved);
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

function useProjects(roots: string[]) {
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

type MemoryInfo = { used_gb: number; total_gb: number; ratio: number };

function useMemoryInfo() {
  const [mem, setMem] = useState<MemoryInfo | null>(null);

  useEffect(() => {
    const poll = () => invoke<MemoryInfo>("get_memory_info").then(setMem);
    poll();
    const id = setInterval(poll, 1000);
    return () => clearInterval(id);
  }, []);

  return mem;
}

type BatteryInfo = {
  percentage: number;
  capacity_health: number;
  cycle_count: number | null;
  status: string;
};

function useBatteryInfo() {
  const [battery, setBattery] = useState<BatteryInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const poll = () =>
      invoke<BatteryInfo>("get_battery_info")
        .then((b) => { setBattery(b); setError(null); })
        .catch((e) => setError(e as string));
    poll();
    const id = setInterval(poll, 5000); // battery data changes slowly, no need for 1s polling
    return () => clearInterval(id);
  }, []);

  return { battery, error };
}

type DiskInfo = { name: string; mount_point: string; total_gb: number; free_gb: number; used_ratio: number };
type TempReading = { label: string; celsius: number };

function useDiskInfo() {
  const [disks, setDisks] = useState<DiskInfo[]>([]);
  useEffect(() => {
    const poll = () => invoke<DiskInfo[]>("get_disk_info").then(setDisks);
    poll();
    const id = setInterval(poll, 10000); // disk usage barely changes minute to minute
    return () => clearInterval(id);
  }, []);
  return disks;
}

function useTemperatures() {
  const [temps, setTemps] = useState<TempReading[]>([]);
  useEffect(() => {
    const poll = () => invoke<TempReading[]>("get_temperatures").then(setTemps);
    poll();
    const id = setInterval(poll, 2000); // temps move faster, worth polling more often
    return () => clearInterval(id);
  }, []);
  return temps;
}

type UnitInfo = {
  name: string;
  description: string;
  load_state: string;
  active_state: string;
  sub_state: string;
};

function prettifyUnitName(name: string): string {
  return name
    .replace(/\.service$/, "")
    .split(/[-_.]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function displayName(unit: UnitInfo): string {
  return unit.description && unit.description.trim() !== ""
    ? unit.description
    : prettifyUnitName(unit.name);
}

type PortInfo = { port: number; protocol: string; pid: number | null; process: string | null };

function usePorts() {
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [busy, setBusy] = useState<number | null>(null);

  const refresh = () => invoke<PortInfo[]>("list_ports").then(setPorts);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, []);

  const kill = async (pid: number, label: string) => {
    const confirmed = await confirm(`Kill process on this port (${label})?`, { title: "Kill port", kind: "warning" });
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

function useManagedUnits() {
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

type ContainerInfo = { id: string; name: string; image: string; status: string; state: string };
type ImageInfo = { id: string; tags: string[]; size_mb: number };

function useDockerContainers() {
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    invoke<ContainerInfo[]>("list_containers")
      .then((c) => { setContainers(c); setError(null); })
      .catch((e) => setError(e as string));

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, []);

  return { containers, error, refresh };
}

function useDockerImages() {
  const [images, setImages] = useState<ImageInfo[]>([]);
  const refresh = () => invoke<ImageInfo[]>("list_images").then(setImages);
  const poll = () => invoke<ImageInfo[]>("list_images").then(setImages);
  useEffect(() => {
    poll();
    refresh()
    const id = setInterval(poll, 10000); // images change rarely, no need for fast polling
    return () => clearInterval(id);
  }, []);
  return { images, refresh };
}

function useContainerActions(refresh: () => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (id: string, name: string, action: "start_container" | "stop_container" | "remove_container") => {
    if (action === "remove_container") {
      const confirmed = await confirm(
        `Permanently remove "${name}"? This cannot be undone.`,
        { title: "Remove container", kind: "warning" }
      );
      if (!confirmed) return;
    }

    setBusy(id);
    try {
      await invoke(action, { containerId: id });
      refresh();
    } catch (e) {
      setError(e as string);
    } finally {
      setBusy(null);
    }
  };

  // const act = async (id: string, action: "start_container" | "stop_container" | "remove_container") => {
  //   setBusy(id);
  //   try {
  //     await invoke(action, { containerId: id });
  //     refresh();
  //   } catch (e) {
  //     setError(e as string);
  //   } finally {
  //     setBusy(null);
  //   }
  // };

  return { act, busy, error };
}

function useOpacitySetting() {
  const [store, setStore] = useState<Store | null>(null);
  const [opacity, setOpacityState] = useState(0.55);

  useEffect(() => {
    Store.load("settings.json").then(async (s) => {
      setStore(s);
      const saved = await s.get<number>("dockOpacity").catch(() => null);
      if (saved !== null && saved !== undefined) setOpacityState(saved);
    });
  }, []);

  const setOpacity = async (value: number) => {
    setOpacityState(value);
    document.documentElement.style.setProperty("--dock-opacity", value.toString());
    if (store) {
      await store.set("dockOpacity", value);
      await store.save();
    }
  };

  return { opacity, setOpacity };
}

function useImageActions(refresh: () => void) {
  const [busy, setBusy] = useState<string | null>(null);

  const removeImage = async (id: string, label: string) => {
    const confirmed = await confirm(`Remove image "${label}"?`, { title: "Remove image", kind: "warning" });
    if (!confirmed) return;
    setBusy(id);
    try {
      await invoke("remove_image", { imageId: id });
      refresh();
    } finally {
      setBusy(null);
    }
  };

  return { removeImage, busy };
}

type VolumeInfo = { name: string; driver: string; mount_point: string };

function useDockerVolumes() {
  const [volumes, setVolumes] = useState<VolumeInfo[]>([]);
  const refresh = () => invoke<VolumeInfo[]>("list_volumes").then(setVolumes);
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10000);
    return () => clearInterval(id);
  }, []);
  return { volumes, refresh };
}

function useVolumeActions(refresh: () => void) {
  const [busy, setBusy] = useState<string | null>(null);

  const removeVolume = async (name: string) => {
    const confirmed = await confirm(`Remove volume "${name}"? Any data inside it is gone permanently.`, {
      title: "Remove volume",
      kind: "warning",
    });
    if (!confirmed) return;
    setBusy(name);
    try {
      await invoke("remove_volume", { volumeName: name });
      refresh();
    } finally {
      setBusy(null);
    }
  };

  return { removeVolume, busy };
}



function App() {
  const mem = useMemoryInfo();
  const { battery, error } = useBatteryInfo();
  const disks = useDiskInfo();
  const temps = useTemperatures();
  const { units, error: unitError, busy, act } = useManagedUnits();
  const { images, refresh: refreshImages } = useDockerImages();
  const { removeImage, busy: imageBusy } = useImageActions(refreshImages);
  const { containers, error: containerError, refresh } = useDockerContainers();
  const { act: actContainer, busy: actBusy } = useContainerActions(refresh);
  const { volumes, refresh: refreshVolumes } = useDockerVolumes();
  const { removeVolume, busy: volumeBusy } = useVolumeActions(refreshVolumes);
  const {busy:portBusy,kill,ports,refresh:portRefresg}= usePorts()

  const { roots, addRoot, removeRoot } = useProjectRoots();
  const projects = useProjects(roots);
  const { opacity, setOpacity } = useOpacitySetting();

  const { prefs, setEditorFor } = useEditorPreferences();

  const openProject = (path: string) => {
    const editor = prefs[path] ?? "vscode"; // default to VS Code until they pick otherwise
    invoke("open_in_editor", { path, editor });
  };

  const [unitSearch, setUnitSearch] = useState("");

  const filteredUnits = units.filter((u) => {
    if (unitSearch.trim() === "") return true;
    const query = unitSearch.toLowerCase();
    return (
      u.name.toLowerCase().includes(query) ||
      displayName(u).toLowerCase().includes(query)
    );
  });

  const [expanded, setExpanded] = useState(false);

  const toggleExpanded = async () => {
    const win = getCurrentWindow();
    if (!expanded) {
      await win.setSize(new LogicalSize(720, 90));
      // dock near top of primary screen
      await win.setPosition(new LogicalPosition(200, 20));
    } else {
      await win.setSize(new LogicalSize(64, 64));
    }
    setExpanded(!expanded);
  };

  const [activeDetail, setActiveDetail] = useState<string | null>(null);

  const toggleDetail = (id: string) => {
    setActiveDetail((prev) => (prev === id ? null : id));
  };

  useEffect(() => {
    if (!expanded) return;
    const win = getCurrentWindow();
    const isFlyout = ["systemd", "docker", "projects", "ports"].includes(activeDetail ?? "");
    // const isFlyout = activeDetail === "systemd" || activeDetail === "docker" || activeDetail === "projects" ||activeDetail === "ports";
    win.setSize(new LogicalSize(720, isFlyout ? 420 : activeDetail ? 150 : 90));
  }, [activeDetail, expanded]);
  // const openProject = (path: string) => invoke("open_in_editor", { path, editor: "vscode" });
  //
  useEffect(() => {
    document.documentElement.style.setProperty("--dock-opacity", opacity.toString());
  }, [opacity]);
  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      {!expanded ? (
        <div className="orb" data-tauri-drag-region>
          <span onClick={toggleExpanded} style={{ cursor: "pointer" }}>⚙</span>
        </div>
      ) : (
        <div className="dock" style={{ flexDirection: "column", alignItems: "stretch", padding: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "0 16px", height: 90 }}>
            <div className="dock-drag-handle" data-tauri-drag-region>⠿</div>

            {mem && (
              <Dial id="ram" ratio={mem.ratio} value={`${mem.used_gb.toFixed(0)}G`} label="RAM" active={activeDetail === "ram"} onToggle={toggleDetail} />
            )}
            {battery && (
              <Dial id="batt" ratio={battery.percentage / 100} value={`${battery.percentage.toFixed(0)}%`} label="BATT" active={activeDetail === "batt"} onToggle={toggleDetail} />
            )}
            {temps.length > 0 && (
              <Dial id="temp" ratio={Math.min(temps[0].celsius / 100, 1)} value={`${temps[0].celsius.toFixed(0)}°`} label="TEMP" active={activeDetail === "temp"} onToggle={toggleDetail} />
            )}
            {disks.length > 0 && (
              <Dial id="disk" ratio={disks[0].used_ratio} value={`${disks[0].free_gb.toFixed(0)}G`} label="DISK" active={activeDetail === "disk"} onToggle={toggleDetail} />
            )}
            <Server size={16} style={{ cursor: "pointer", opacity: activeDetail === "systemd" ? 1 : 0.5, color: activeDetail === "systemd" ? "#5eead4" : "#e8e8e8" }} onClick={() => toggleDetail("systemd")} />
            <Container size={16} style={{ cursor: "pointer", opacity: activeDetail === "docker" ? 1 : 0.5, color: activeDetail === "docker" ? "#5eead4" : "#e8e8e8" }} onClick={() => toggleDetail("docker")} />
              <FolderGit2 size={16} style={{ cursor: "pointer", opacity: activeDetail === "projects" ? 1 : 0.5, color: activeDetail === "projects" ? "#5eead4" : "#e8e8e8" }} onClick={() => toggleDetail("projects")} />
              <Plug size={16} style={{ cursor: "pointer", opacity: activeDetail === "ports" ? 1 : 0.5, color: activeDetail === "ports" ? "#5eead4" : "#e8e8e8" }} onClick={() => toggleDetail("ports")} />
              <Settings size={16} style={{ cursor: "pointer", opacity: activeDetail === "settings" ? 1 : 0.5, color: activeDetail === "settings" ? "#5eead4" : "#e8e8e8" }} onClick={() => toggleDetail("settings")} />
            <span onClick={toggleExpanded} style={{ cursor: "pointer", marginLeft: "auto", opacity: 0.4 }}>✕</span>
          </div>

          {activeDetail === "ram" && mem && (
            <DetailPanel rows={[
              { label: "Used", value: `${mem.used_gb.toFixed(1)} GB` },
              { label: "Total", value: `${mem.total_gb.toFixed(1)} GB` },
            ]} />
          )}
          {activeDetail === "batt" && battery && (
            <DetailPanel rows={[
              { label: "Health", value: `${battery.capacity_health.toFixed(0)}%` },
              { label: "Cycles", value: battery.cycle_count?.toString() ?? "—" },
              { label: "Status", value: battery.status },
            ]} />
          )}
          {activeDetail === "temp" && (
            <DetailPanel rows={temps.slice(0, 4).map((t) => ({ label: t.label, value: `${t.celsius.toFixed(0)}°C` }))} />
          )}
          {activeDetail === "disk" && (
            <DetailPanel rows={disks.map((d) => ({ label: d.mount_point, value: `${d.free_gb.toFixed(0)}G free` }))} />
            )}
          {activeDetail === "systemd" && (
            <Flyout>
              <input
                type="text"
                placeholder="Search services..."
                value={unitSearch}
                onChange={(e) => setUnitSearch(e.target.value)}
                style={{
                  width: "100%", marginBottom: 8, padding: "6px 8px",
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 6, color: "#e8e8e8", fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                }}
              />
              {filteredUnits.map((u) => (
                <FlyoutRow
                  key={u.name}
                  title={displayName(u)}
                  subtitle={u.name}
                  status={`${u.active_state} (${u.sub_state})`}
                  statusColor={u.active_state === "active" ? "#5eead4" : u.active_state === "failed" ? "#f87171" : undefined}
                  actions={<>
                    <FlyoutButton disabled={busy === u.name} onClick={() => act(u.name, "start_unit")}>start</FlyoutButton>
                    <FlyoutButton disabled={busy === u.name} onClick={() => act(u.name, "stop_unit")}>stop</FlyoutButton>
                    <FlyoutButton disabled={busy === u.name} onClick={() => act(u.name, "restart_unit")}>restart</FlyoutButton>
                  </>}
                />
              ))}
            </Flyout>
            )}
          {activeDetail === "docker" && (
            <Flyout>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", marginBottom: 6 }}>
                Containers
              </div>
              {containers.map((c) => (
                <FlyoutRow
                  key={c.id}
                  title={c.name}
                  subtitle={c.image}
                  status={c.status}
                  statusColor={c.state === "running" ? "#5eead4" : undefined}
                  actions={<>
                    <FlyoutButton disabled={actBusy === c.id} onClick={() => actContainer(c.id, c.name, "start_container")}>start</FlyoutButton>
                    <FlyoutButton disabled={actBusy === c.id} onClick={() => actContainer(c.id, c.name, "stop_container")}>stop</FlyoutButton>
                    <FlyoutButton disabled={actBusy === c.id} onClick={() => actContainer(c.id, c.name, "remove_container")}>remove</FlyoutButton>
                  </>}
                />
              ))}

              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", margin: "12px 0 6px" }}>
                Images
              </div>
              {images.map((img) => (
                <FlyoutRow
                  key={img.id}
                  title={img.tags.length > 0 ? img.tags.join(", ") : `<untagged> ${img.id}`}
                  subtitle={`${img.size_mb.toFixed(0)} MB`}
                  actions={<FlyoutButton disabled={imageBusy === img.id} onClick={() => removeImage(img.id, img.tags[0] ?? img.id)}>remove</FlyoutButton>}
                />
              ))}

              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", margin: "12px 0 6px" }}>
                Volumes
              </div>
              {volumes.map((v) => (
                <FlyoutRow
                  key={v.name}
                  title={v.name}
                  subtitle={`${v.driver} · ${v.mount_point}`}
                  actions={<FlyoutButton disabled={volumeBusy === v.name} onClick={() => removeVolume(v.name)}>remove</FlyoutButton>}
                />
              ))}
            </Flyout>
            )}
          {activeDetail === "projects" && (
            <Flyout>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{roots.length} folder{roots.length !== 1 && "s"} scanned</span>
                <FlyoutButton onClick={addRoot}>add folder</FlyoutButton>
              </div>

              {["Flutter", "TypeScript", "JavaScript", "Python", "Go", "Rust", "C#"].map((kind) => {
                const group = projects.filter((p) => p.kind === kind);
                if (group.length === 0) return null;
                return (
                  <div key={kind}>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", margin: "10px 0 4px" }}>
                      {kind}
                    </div>
                    {group.map((p) => (
                      <FlyoutRow
                        key={p.path}
                        title={p.name}
                        subtitle={p.path}
                        actions={
                          <EditorPicker
                            value={prefs[p.path] ?? "vscode"}
                            onChange={(editor) => setEditorFor(p.path, editor)}
                          />
                        }
                      />
                    ))}
                  </div>
                );
              })}
            </Flyout>
            )}
          {activeDetail === "ports" && (
            <Flyout>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                <FlyoutButton onClick={portRefresg}>refresh</FlyoutButton>
              </div>
              {ports.map((p) => (
                <FlyoutRow
                  key={p.port}
                  title={`:${p.port}`}
                  subtitle={p.process ?? "unknown process"}
                  status={p.protocol.toUpperCase()}
                  actions={
                    p.pid ? (
                      <FlyoutButton disabled={portBusy === p.pid} onClick={() => kill(p.pid!, `:${p.port} (${p.process ?? "unknown"})`)}>kill</FlyoutButton>
                    ) : undefined
                  }
                />
              ))}
            </Flyout>
            )}
          {activeDetail === "settings" && (
            <div style={{ padding: "10px 16px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 6 }}>
                Dock Opacity
              </div>
              <input
                type="range"
                min="0.15"
                max="0.9"
                step="0.05"
                value={opacity}
                onChange={(e) => setOpacity(parseFloat(e.target.value))}
                style={{ width: "100%" }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
