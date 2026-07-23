import { useEffect, useState } from "react";
import reactLogo from "./assets/react.svg";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import "./App.css";


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

function App() {
  const mem = useMemoryInfo();
  const { battery, error } = useBatteryInfo();
  const disks = useDiskInfo();
  const temps = useTemperatures();
  const { units, error: unitError, busy, act } = useManagedUnits();
  const { images, refresh: refreshImages } = useDockerImages();
  const { removeImage, busy: imageBusy } = useImageActions(refreshImages);
  const { containers, error: containerError, refresh } = useDockerContainers();
  const { act:actContainer, busy:actBusy } = useContainerActions(refresh);

  return (
    <div>
      {mem && (
        <div>
          <p>{mem.used_gb.toFixed(1)} GB / {mem.total_gb.toFixed(1)} GB</p>
          <div style={{ background: "#333", height: 8, borderRadius: 4 }}>
            <div style={{
              width: `${mem.ratio * 100}%`,
              background: "#22d3ee",
              height: "100%",
              borderRadius: 4,
              transition: "width 0.3s"
            }} />
          </div>
        </div>
      )}
      <div style={{ marginTop: 16 }}>
        <h3>Battery</h3>
        {error && <p style={{ color: "#f87171" }}>{error}</p>}
        {battery && (
          <div>
            <p>{battery.percentage.toFixed(0)}% — {battery.status}</p>
            <div style={{ background: "#333", height: 8, borderRadius: 4 }}>
              <div style={{
                width: `${battery.percentage}%`,
                background: "#facc15",
                height: "100%",
                borderRadius: 4,
                transition: "width 0.3s"
              }} />
            </div>
            <p style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
              Health: {battery.capacity_health.toFixed(1)}% of design capacity
              {battery.cycle_count !== null && ` · ${battery.cycle_count} cycles`}
            </p>
          </div>
        )}
      </div>
      <div style={{ marginTop: 16 }}>
           <h3>Storage</h3>
           {disks.map((d) => (
             <div key={d.mount_point} style={{ marginBottom: 8 }}>
               <p>{d.mount_point} — {d.free_gb.toFixed(1)} GB free of {d.total_gb.toFixed(1)} GB</p>
               <div style={{ background: "#333", height: 8, borderRadius: 4 }}>
                 <div style={{ width: `${d.used_ratio * 100}%`, background: "#2dd4bf", height: "100%", borderRadius: 4 }} />
               </div>
             </div>
           ))}
         </div>

         <div style={{ marginTop: 16 }}>
           <h3>Thermal</h3>
           {temps.length === 0 && <p style={{ opacity: 0.6 }}>No sensors detected</p>}
           {temps.map((t) => (
             <p key={t.label}>{t.label}: {t.celsius.toFixed(1)}°C</p>
           ))}
      </div>

      <div style={{ marginTop: 16 }}>
         <h3>Services ({units.length})</h3>
         {unitError && <p style={{ color: "#f87171" }}>{unitError}</p>}
         <div style={{ maxHeight: 400, overflowY: "auto" }}>
           {units.map((u) => (
             <div key={u.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #333" }}>
               <div>
                 <div>{displayName(u)}</div>
                 <div style={{ fontSize: 11, opacity: 0.5 }}>{u.name}</div>
                 <div style={{ fontSize: 12, color: u.active_state === "active" ? "#4ade80" : u.active_state === "failed" ? "#f87171" : "#9ca3af" }}>
                   {u.active_state} ({u.sub_state})
                 </div>
               </div>
               <div style={{ display: "flex", gap: 4 }}>
                 <button disabled={busy === u.name} onClick={() => act(u.name, "start_unit")}>Start</button>
                 <button disabled={busy === u.name} onClick={() => act(u.name, "stop_unit")}>Stop</button>
                 <button disabled={busy === u.name} onClick={() => act(u.name, "restart_unit")}>Restart</button>
               </div>
             </div>
           ))}
         </div>
      </div>

      <div style={{ marginTop: 16 }}>
         <h3>Docker Containers ({containers.length})</h3>
         {containerError && <p style={{ color: "#f87171" }}>{containerError}</p>}
         {containers.map((c) => (
           <div key={c.id} style={{ padding: "6px 0", borderBottom: "1px solid #333" }}>
             <div>{c.name} <span style={{ opacity: 0.5, fontSize: 12 }}>({c.image})</span></div>
             <div style={{ fontSize: 12, color: c.state === "running" ? "#4ade80" : "#9ca3af" }}>{c.status}</div>
             <div key={c.id} style={{ padding: "6px 0", borderBottom: "1px solid #333" }}>
               <div>{c.name} <span style={{ opacity: 0.5, fontSize: 12 }}>({c.image})</span></div>
               <div style={{ fontSize: 12, color: c.state === "running" ? "#4ade80" : "#9ca3af" }}>{c.status}</div>
               <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                 <button disabled={busy === c.id} onClick={() => actContainer(c.id, c.name,"start_container")}>Start</button>
                 <button disabled={busy === c.id} onClick={() => actContainer(c.id,c.name, "stop_container")}>Stop</button>
                 <button disabled={busy === c.id} onClick={() => actContainer(c.id, c.name,"remove_container")}>Remove</button>
               </div>
             </div>
           </div>
         ))}

         <h3 style={{ marginTop: 16 }}>Docker Images ({images.length})</h3>
         {images.map((img) => (
           <div key={img.id} style={{ padding: "6px 0", borderBottom: "1px solid #333" }}>
             <div>{img.tags.length > 0 ? img.tags.join(", ") : `<untagged> ${img.id}`}</div>
             <div style={{ fontSize: 12, opacity: 0.6 }}>{img.size_mb.toFixed(0)} MB</div>
             <button disabled={imageBusy === img.id} onClick={() => removeImage(img.id, img.tags[0] ?? img.id)}>Remove</button>
           </div>
         ))}
       </div>
    </div>
  );
}

export default App;
