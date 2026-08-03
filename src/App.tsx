import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

import { DetailPanel, Dial } from "./Dial";
import { Settings as SettingsIcon } from "lucide-react";

import { useMemoryInfo, useBatteryInfo, useDiskInfo, useTemperatures } from "./hooks/useSystemStats";
import { useManagedUnits } from "./hooks/useSystemd";
import { useDockerContainers, useContainerActions, useDockerImages, useImageActions, useDockerVolumes, useVolumeActions } from "./hooks/useDocker";
import { useProjectRoots, useEditorPreferences, useProjects, useGitStatuses, useEnvRisks, useBloatScan, useInstalledEditors, useComposeActions } from "./hooks/useProjects";
import { usePorts } from "./hooks/usePorts";
import { useCronJobs } from "./hooks/useCron";
import { useNotes } from "./hooks/useNotes";
import { useJournalEntries } from "./hooks/useJournal";
import { useSavedConnections } from "./hooks/useDatabase";
import { useSavedRequests } from "./hooks/useRestClient";
import { useMusicRoots, useMusicLibrary, usePlayer } from "./hooks/useMusic";
import { useOpacitySetting, useAccentSetting, useDefaultEditor, useConfirmationsSetting } from "./hooks/useSettings";
import { useTasks } from "./hooks/useTasks";
import { useTabSettings } from "./hooks/useTabSettings";
import { usePaletteUsage } from "./hooks/usePaletteUsage";
import { TAB_REGISTRY, type TabId } from "./tabRegistry";

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
import { TasksPanel } from "./panels/TasksPanel";
import { RestClientPanel } from "./panels/RestClientPanel";
import { DatabasePanel } from "./panels/DatabasePanel";
import { JournalPanel } from "./panels/JournalPanel";
import { CommandPalette, type PaletteItem } from "./CommandPalette";

const FLYOUT_PANELS = ["systemd", "docker", "projects", "ports", "notes", "secrets", "bloat", "cron", "music", "settings", "tasks", "rest", "database", "journal"];
const FIXED_DETAIL_IDS = ["ram", "batt", "temp", "disk", "settings"]; // never hidden by tab config

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
  const editors = useInstalledEditors();
  const { risks: envRisks } = useEnvRisks(projects);
  const exposedCount = envRisks.filter((r) => !r.gitignored && r.suspicious_keys.length > 0).length;
  const { entries: bloatEntries, scan: scanBloat, scanning: bloatScanning, prune: pruneBloat, busy: bloatBusy } = useBloatScan(projects, skipConfirmations);
  const { up: composeUp, down: composeDown, busy: composeBusy } = useComposeActions(refreshContainers);

  const openProject = (path: string) => {
    const editorId = prefs[path] ?? defaultEditor;
    const command = editors.find((e) => e.id === editorId)?.command ?? editorId;
    return invoke("open_in_editor", { path, editor: command });
  };

  const { ports, kill: killPort, busy: portBusy, refresh: refreshPorts } = usePorts(skipConfirmations);
  const { jobs: cronJobs, remove: removeCron, addJob: addCronJob, busy: cronBusy } = useCronJobs(skipConfirmations);
  const { notes, updateNotes, saved: notesSaved } = useNotes();
  const { tasks, addTask, toggleTask, deleteTask } = useTasks();

  const { roots: musicRoots, addRoot: addMusicRoot, removeMusicRoot } = useMusicRoots();
  const { tracks, scan: scanLibrary, scanning: musicScanning } = useMusicLibrary(musicRoots);
  const player = usePlayer();

  const { tabs, visibleTabs, toggleTab, moveTab, enabledCount } = useTabSettings();

  const [expanded, setExpanded] = useState(false);
  const [activeDetail, setActiveDetail] = useState<string | null>(null);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState<{ panel: string; id: string } | null>(null);

  const { entries: journalEntries } = useJournalEntries();
  const { connections: remoteDbConnections } = useSavedConnections();
  const { saved: savedRequests } = useSavedRequests();
  const { recordUsage, scoreOf } = usePaletteUsage();

  const toggleExpanded = async () => {
    const win = getCurrentWindow();
    if (!expanded) {
      await win.setSize(new LogicalSize(820, 90));
      await win.setPosition(new LogicalPosition(200, 20));
      // resizing/repositioning an always-on-top, undecorated window drops OS-level
      // keyboard focus on most Linux WMs, so keystrokes silently go nowhere afterward.
      // Never let this block the actual expand state change below.
      await win.setFocus().catch(() => {});
    } else {
      await win.setSize(new LogicalSize(64, 64));
    }
    setExpanded(!expanded);
  };

  const toggleDetail = (id: string) => setActiveDetail((prev) => (prev === id ? null : id));

  useEffect(() => {
    if (!expanded) return;
    const isFlyout = FLYOUT_PANELS.includes(activeDetail ?? "");
    const win = getCurrentWindow();
    win.setSize(new LogicalSize(820, isFlyout ? 420 : activeDetail ? 150 : 90)).then(() => win.setFocus().catch(() => {}));
  }, [activeDetail, expanded]);

  useEffect(() => {
    document.documentElement.style.setProperty("--dock-opacity", opacity.toString());
  }, [opacity]);

  // if a panel gets disabled in settings while it's open, close it rather than leaving a dead view up
  useEffect(() => {
    if (activeDetail && !FIXED_DETAIL_IDS.includes(activeDetail) && !visibleTabs.includes(activeDetail as TabId)) {
      setActiveDetail(null);
    }
  }, [visibleTabs]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (!expanded) toggleExpanded();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [expanded]);

  const iconStyle = (id: string) => ({ cursor: "pointer" as const, opacity: activeDetail === id ? 1 : 0.5, color: activeDetail === id ? "#5eead4" : "#e8e8e8" });

  const PANEL_LABELS: Record<string, string> = {
    systemd: "Services", docker: "Docker", projects: "Projects", ports: "Ports",
    notes: "Notes", secrets: "Secrets", bloat: "Bloat", cron: "Cron Jobs",
    music: "Music", settings: "Settings", tasks: "Tasks", rest: "REST Client",
    database: "Database", journal: "Journal",
  };

  const openPanel = (panel: string, id?: string) => {
    setActiveDetail(panel);
    if (id) setPendingOpen({ panel, id });
  };

  const rawPaletteItems: PaletteItem[] = [
    ...Object.entries(PANEL_LABELS).map(([id, label]) => ({
      id: `panel-${id}`, section: "Panels", label,
      onSelect: () => openPanel(id),
    })),
    ...projects.map((p) => ({
      id: `project-${p.path}`, section: "Projects", label: p.name, sublabel: p.kind,
      keywords: p.path,
      onSelect: () => openProject(p.path),
    })),
    ...journalEntries.map((e) => ({
      id: `journal-${e.id}`, section: "Journal", label: e.title, sublabel: e.date,
      onSelect: () => openPanel("journal", e.id),
    })),
    ...remoteDbConnections.map((c) => ({
      id: `dbconn-${c.id}`, section: "Database Connections", label: c.name,
      sublabel: `${c.provider} · ${c.host}`,
      onSelect: () => openPanel("database", c.id),
    })),
    ...savedRequests.map((r) => ({
      id: `rest-${r.id}`, section: "Saved Requests", label: r.name, sublabel: r.method,
      onSelect: () => openPanel("rest", r.id),
    })),
    ...cronJobs.map((j) => ({
      id: `cron-${j.raw_line}`, section: "Cron Jobs", label: j.human_readable, sublabel: j.command,
      onSelect: () => openPanel("cron"),
    })),
    ...tasks.map((t) => ({
      id: `task-${t.id}`, section: "Tasks", label: t.title,
      onSelect: () => openPanel("tasks"),
    })),
  ];

  const paletteItems: PaletteItem[] = rawPaletteItems.map((item) => ({
    ...item,
    onSelect: () => { recordUsage(item.id); item.onSelect(); },
  }));

  const paletteExtraItems = (query: string): PaletteItem[] => {
    const killMatch = query.match(/^kill\s+(\d+)/i);
    if (killMatch) {
      const portNum = parseInt(killMatch[1], 10);
      const found = ports.find((p) => p.port === portNum);
      if (found) {
        return [{
          id: `action-kill-${portNum}`, section: "Actions",
          label: `Kill process on port ${portNum}${found.process ? ` (${found.process})` : ""}`,
          sublabel: "kill -9",
          onSelect: () => killPort(found.pid ?? 0, found.process ?? `port ${portNum}`),
        }];
      }
    }
    return [];
  };

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

            {visibleTabs.map((id) => {
              const config = TAB_REGISTRY[id];
              const Icon = config.icon;
              const isSecrets = id === "secrets";
              return (
                <Icon
                  key={id}
                  size={16}
                  style={isSecrets
                    ? { ...iconStyle(id), color: activeDetail === id ? "#5eead4" : exposedCount > 0 ? "#f87171" : "#e8e8e8" }
                    : iconStyle(id)}
                  onClick={() => toggleDetail(id)}
                />
              );
            })}

              <SettingsIcon size={16} style={iconStyle("settings")} onClick={() => toggleDetail("settings")} />
              <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={paletteItems} extraItemsForQuery={paletteExtraItems} scoreOf={scoreOf} />
            <span onClick={toggleExpanded} style={{ cursor: "pointer", marginLeft: "auto", opacity: 0.4 }}>✕</span>
          </div>

          {activeDetail === "ram" && mem && <DetailPanel rows={[{ label: "Used", value: `${mem.used_gb.toFixed(1)} GB` }, { label: "Total", value: `${mem.total_gb.toFixed(1)} GB` }]} />}
          {activeDetail === "batt" && battery && <DetailPanel rows={[{ label: "Health", value: `${battery.capacity_health.toFixed(0)}%` }, { label: "Cycles", value: battery.cycle_count?.toString() ?? "—" }, { label: "Status", value: battery.status }]} />}
          {activeDetail === "temp" && <DetailPanel rows={temps.slice(0, 4).map((t) => ({ label: t.label, value: `${t.celsius.toFixed(0)}°C` }))} />}
          {activeDetail === "disk" && <DetailPanel rows={disks.map((d) => ({ label: d.mount_point, value: `${d.free_gb.toFixed(0)}G free` }))} />}

          {activeDetail === "systemd" && <SystemdPanel units={units} search={unitSearch} onSearchChange={setUnitSearch} busy={unitBusy} act={actUnit} error={unitError} />}
          {activeDetail === "docker" && <DockerPanel containers={containers} images={images} volumes={volumes} actBusy={containerBusy} actContainer={actContainer} imageBusy={imageBusy} removeImage={removeImage} volumeBusy={volumeBusy} removeVolume={removeVolume} />}
          {activeDetail === "projects" && <ProjectsPanel roots={roots} addRoot={addRoot} removeRoot={removeRoot} projects={projects} statuses={statuses} prefs={prefs} setEditorFor={setEditorFor} openProject={openProject} editors={editors} composeUp={composeUp} composeDown={composeDown} composeBusy={composeBusy} />}
          {activeDetail === "ports" && <PortsPanel ports={ports} busy={portBusy} kill={killPort} refresh={refreshPorts} />}
          {activeDetail === "settings" && (
            <SettingsPanel
              opacity={opacity} setOpacity={setOpacity}
              accent={accent} setAccent={setAccent}
              defaultEditor={defaultEditor} setDefaultEditor={setDefaultEditor} editors={editors}
              skipConfirmations={skipConfirmations} setSkipConfirmations={setSkipConfirmations}
              tabs={tabs} toggleTab={toggleTab} moveTab={moveTab} enabledCount={enabledCount}
            />
          )}
          {activeDetail === "notes" && <NotesPanel notes={notes} updateNotes={updateNotes} saved={notesSaved} />}
          {activeDetail === "secrets" && <SecretsPanel risks={envRisks} />}
          {activeDetail === "bloat" && <BloatPanel entries={bloatEntries} scan={scanBloat} scanning={bloatScanning} prune={pruneBloat} busy={bloatBusy} />}
          {activeDetail === "cron" && <CronPanel jobs={cronJobs} busy={cronBusy} remove={removeCron} addJob={addCronJob} />}
          {activeDetail === "music" && <MusicPanel musicRoots={musicRoots} addMusicRoot={addMusicRoot} removeMusicRoot={removeMusicRoot} tracks={tracks} scanLibrary={scanLibrary} scanning={musicScanning} {...player} />}
          {activeDetail === "tasks" && <TasksPanel tasks={tasks} addTask={addTask} toggleTask={toggleTask} deleteTask={deleteTask} />}
          {activeDetail === "journal" && (
            <JournalPanel
              openEntryId={pendingOpen?.panel === "journal" ? pendingOpen.id : undefined}
              onConsumeOpenEntry={() => setPendingOpen(null)}
            />
          )}
          {activeDetail === "database" && (
            <DatabasePanel
              sqliteRoots={[]}
              openConnectionId={pendingOpen?.panel === "database" ? pendingOpen.id : undefined}
              onConsumeOpenConnection={() => setPendingOpen(null)}
            />
          )}
          {activeDetail === "rest" && (
            <RestClientPanel
              openRequestId={pendingOpen?.panel === "rest" ? pendingOpen.id : undefined}
              onConsumeOpenRequest={() => setPendingOpen(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default App;
