import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

import { DetailPanel, Dial } from "./Dial";
import { Server, Container, FolderGit2, Plug, Settings as SettingsIcon, StickyNote, ShieldAlert, Trash2, Clock, Music } from "lucide-react";

import { useMemoryInfo, useBatteryInfo, useDiskInfo, useTemperatures } from "./hooks/useSystemStats";
import { useManagedUnits } from "./hooks/useSystemd";
import { useDockerContainers, useContainerActions, useDockerImages, useImageActions, useDockerVolumes, useVolumeActions } from "./hooks/useDocker";
import { useProjectRoots, useEditorPreferences, useProjects, useGitStatuses, useEnvRisks, useBloatScan } from "./hooks/useProjects";
import { usePorts } from "./hooks/usePorts";
import { useCronJobs } from "./hooks/useCron";
import { useNotes } from "./hooks/useNotes";
import { useMusicRoots, useMusicLibrary, usePlayer } from "./hooks/useMusic";
import { useOpacitySetting, useAccentSetting, useDefaultEditor, useConfirmationsSetting } from "./hooks/useSettings";

import { SystemdPanel } from "./panels/SystemdPanel";
import { DockerPanel } from "./panels/DockerPanel";
import { ProjectsPanel } from "./panels/ProjectsPanel";
import { PortsPanel } from "./panels/PortsPanel";
import { SettingsPanel } from "./panels/SettingsPanel";
import { NotesPanel } from "./panels/NotesPanel";
import { SecretsPanel } from "./panels/SecretsPanel";
import { BloatPanel } from "./panels/BloatPanel";
import { CronPanel } from "./panels/CronPanel";
import { MusicPanel } from "./panels/MusicPanel";

import { CheckSquare } from "lucide-react";
import { useTasks } from "./hooks/useTasks";
import { TasksPanel } from "./panels/TasksPanel";

import { Radio } from "lucide-react";
import { RestClientPanel } from "./panels/RestClientPanel";

const FLYOUT_PANELS = ["systemd", "docker", "projects", "ports", "notes", "secrets", "bloat", "cron", "music", "settings", "tasks", "rest"];

function App() {
  const mem = useMemoryInfo();
  const { battery } = useBatteryInfo();
  const disks = useDiskInfo();
  const temps = useTemperatures();

  const { skipConfirmations, setSkipConfirmations } = useConfirmationsSetting();
  const { opacity, setOpacity } = useOpacitySetting();
  const { accent, setAccent } = useAccentSetting();
  const { defaultEditor, setDefaultEditor } = useDefaultEditor();

  const { units, error: unitError, busy: unitBusy, act: actUnit } = useManagedUnits();
  const [unitSearch, setUnitSearch] = useState("");

  const { containers, refresh: refreshContainers } = useDockerContainers();
  const { act: actContainer, busy: containerBusy } = useContainerActions(refreshContainers, skipConfirmations);
  const { images, refresh: refreshImages } = useDockerImages();
  const { removeImage, busy: imageBusy } = useImageActions(refreshImages, skipConfirmations);
  const { volumes, refresh: refreshVolumes } = useDockerVolumes();
  const { removeVolume, busy: volumeBusy } = useVolumeActions(refreshVolumes, skipConfirmations);

  const { roots, addRoot, removeRoot } = useProjectRoots();
  const projects = useProjects(roots);
  const { statuses } = useGitStatuses(projects);
  const { prefs, setEditorFor } = useEditorPreferences();
  const { risks: envRisks } = useEnvRisks(projects);
  const exposedCount = envRisks.filter((r) => !r.gitignored && r.suspicious_keys.length > 0).length;
  const { entries: bloatEntries, scan: scanBloat, scanning: bloatScanning, prune: pruneBloat, busy: bloatBusy } = useBloatScan(projects, skipConfirmations);

  const openProject = (path: string) => invoke("open_in_editor", { path, editor: prefs[path] ?? defaultEditor });

  const { ports, kill: killPort, busy: portBusy, refresh: refreshPorts } = usePorts(skipConfirmations);
  const { jobs: cronJobs, remove: removeCron, busy: cronBusy } = useCronJobs(skipConfirmations);
  const { notes, updateNotes, saved: notesSaved } = useNotes();

  const { tasks, addTask, toggleTask, deleteTask } = useTasks();

  const { roots: musicRoots, addRoot: addMusicRoot, removeMusicRoot } = useMusicRoots();
  const { tracks, scan: scanLibrary, scanning: musicScanning } = useMusicLibrary(musicRoots);
  const player = usePlayer();

  const [expanded, setExpanded] = useState(false);
  const [activeDetail, setActiveDetail] = useState<string | null>(null);

  const toggleExpanded = async () => {
    const win = getCurrentWindow();
    if (!expanded) {
      await win.setSize(new LogicalSize(820, 90));
      await win.setPosition(new LogicalPosition(200, 20));
    } else {
      await win.setSize(new LogicalSize(64, 64));
    }
    setExpanded(!expanded);
  };

  const toggleDetail = (id: string) => setActiveDetail((prev) => (prev === id ? null : id));

  useEffect(() => {
    if (!expanded) return;
    const isFlyout = FLYOUT_PANELS.includes(activeDetail ?? "");
    getCurrentWindow().setSize(new LogicalSize(820, isFlyout ? 420 : activeDetail ? 150 : 90));
  }, [activeDetail, expanded]);

  useEffect(() => {
    document.documentElement.style.setProperty("--dock-opacity", opacity.toString());
  }, [opacity]);

  const iconStyle = (id: string) => ({ cursor: "pointer" as const, opacity: activeDetail === id ? 1 : 0.5, color: activeDetail === id ? "#5eead4" : "#e8e8e8" });

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
            {mem && <Dial id="ram" ratio={mem.ratio} value={`${mem.used_gb.toFixed(0)}G`} label="RAM" active={activeDetail === "ram"} onToggle={toggleDetail} />}
            {battery && <Dial id="batt" ratio={battery.percentage / 100} value={`${battery.percentage.toFixed(0)}%`} label="BATT" active={activeDetail === "batt"} onToggle={toggleDetail} />}
            {temps.length > 0 && <Dial id="temp" ratio={Math.min(temps[0].celsius / 100, 1)} value={`${temps[0].celsius.toFixed(0)}°`} label="TEMP" active={activeDetail === "temp"} onToggle={toggleDetail} />}
            {disks.length > 0 && <Dial id="disk" ratio={disks[0].used_ratio} value={`${disks[0].free_gb.toFixed(0)}G`} label="DISK" active={activeDetail === "disk"} onToggle={toggleDetail} />}
            <Server size={16} style={iconStyle("systemd")} onClick={() => toggleDetail("systemd")} />
            <Container size={16} style={iconStyle("docker")} onClick={() => toggleDetail("docker")} />
            <FolderGit2 size={16} style={iconStyle("projects")} onClick={() => toggleDetail("projects")} />
            <Plug size={16} style={iconStyle("ports")} onClick={() => toggleDetail("ports")} />
            <SettingsIcon size={16} style={iconStyle("settings")} onClick={() => toggleDetail("settings")} />
            <StickyNote size={16} style={iconStyle("notes")} onClick={() => toggleDetail("notes")} />
            <ShieldAlert size={16} style={{ ...iconStyle("secrets"), color: activeDetail === "secrets" ? "#5eead4" : exposedCount > 0 ? "#f87171" : "#e8e8e8" }} onClick={() => toggleDetail("secrets")} />
            <Trash2 size={16} style={iconStyle("bloat")} onClick={() => toggleDetail("bloat")} />
            <Clock size={16} style={iconStyle("cron")} onClick={() => toggleDetail("cron")} />
            <Music size={16} style={iconStyle("music")} onClick={() => toggleDetail("music")} />
              <CheckSquare size={16} style={iconStyle("tasks")} onClick={() => toggleDetail("tasks")} />
              <Radio size={16} style={iconStyle("rest")} onClick={() => toggleDetail("rest")} />
            <span onClick={toggleExpanded} style={{ cursor: "pointer", marginLeft: "auto", opacity: 0.4 }}>✕</span>
          </div>

          {activeDetail === "ram" && mem && <DetailPanel rows={[{ label: "Used", value: `${mem.used_gb.toFixed(1)} GB` }, { label: "Total", value: `${mem.total_gb.toFixed(1)} GB` }]} />}
          {activeDetail === "batt" && battery && <DetailPanel rows={[{ label: "Health", value: `${battery.capacity_health.toFixed(0)}%` }, { label: "Cycles", value: battery.cycle_count?.toString() ?? "—" }, { label: "Status", value: battery.status }]} />}
          {activeDetail === "temp" && <DetailPanel rows={temps.slice(0, 4).map((t) => ({ label: t.label, value: `${t.celsius.toFixed(0)}°C` }))} />}
          {activeDetail === "disk" && <DetailPanel rows={disks.map((d) => ({ label: d.mount_point, value: `${d.free_gb.toFixed(0)}G free` }))} />}

          {activeDetail === "systemd" && <SystemdPanel units={units} search={unitSearch} onSearchChange={setUnitSearch} busy={unitBusy} act={actUnit} error={unitError} />}
          {activeDetail === "docker" && <DockerPanel containers={containers} images={images} volumes={volumes} actBusy={containerBusy} actContainer={actContainer} imageBusy={imageBusy} removeImage={removeImage} volumeBusy={volumeBusy} removeVolume={removeVolume} />}
          {activeDetail === "projects" && <ProjectsPanel roots={roots} addRoot={addRoot} removeRoot={removeRoot} projects={projects} statuses={statuses} prefs={prefs} setEditorFor={setEditorFor} openProject={openProject} />}
          {activeDetail === "ports" && <PortsPanel ports={ports} busy={portBusy} kill={killPort} refresh={refreshPorts} />}
          {activeDetail === "settings" && <SettingsPanel opacity={opacity} setOpacity={setOpacity} accent={accent} setAccent={setAccent} defaultEditor={defaultEditor} setDefaultEditor={setDefaultEditor} skipConfirmations={skipConfirmations} setSkipConfirmations={setSkipConfirmations} />}
          {activeDetail === "notes" && <NotesPanel notes={notes} updateNotes={updateNotes} saved={notesSaved} />}
          {activeDetail === "secrets" && <SecretsPanel risks={envRisks} />}
          {activeDetail === "bloat" && <BloatPanel entries={bloatEntries} scan={scanBloat} scanning={bloatScanning} prune={pruneBloat} busy={bloatBusy} />}
          {activeDetail === "cron" && <CronPanel jobs={cronJobs} busy={cronBusy} remove={removeCron} />}
          {activeDetail === "music" && <MusicPanel musicRoots={musicRoots} addMusicRoot={addMusicRoot} removeMusicRoot={removeMusicRoot} tracks={tracks} scanLibrary={scanLibrary} scanning={musicScanning} {...player} />}
          {activeDetail === "tasks" && <TasksPanel tasks={tasks} addTask={addTask} toggleTask={toggleTask} deleteTask={deleteTask} />}
          {activeDetail === "rest" && <RestClientPanel />}
        </div>
      )}
    </div>
  );
}

export default App;
