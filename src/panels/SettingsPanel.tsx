import { useState } from "react";
import { Flyout, EditorPicker, FlyoutButton } from "../Flyout";
import { ACCENT_PRESETS } from "../hooks/useSettings";
import { TAB_REGISTRY, MIN_ENABLED_TABS, type TabId } from "../tabRegistry";
import { ChevronDown, ChevronUp } from "lucide-react";
import { save, open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { confirmUnless } from "../utils";
import type { EditorInfo } from "../types";

type TabConfig = { id: TabId; enabled: boolean };

type Props = {
  opacity: number;
  setOpacity: (v: number) => void;
  accent: string;
  setAccent: (v: string) => void;
  defaultEditor: string;
  setDefaultEditor: (v: string) => void;
  editors: EditorInfo[];
  skipConfirmations: boolean;
  setSkipConfirmations: (v: boolean) => void;
  tabs: TabConfig[];
  toggleTab: (id: TabId) => void;
  moveTab: (id: TabId, direction: -1 | 1) => void;
  enabledCount: number;
};

export function SettingsPanel({
  opacity, setOpacity, accent, setAccent, defaultEditor, setDefaultEditor, editors,
  skipConfirmations, setSkipConfirmations, tabs, toggleTab, moveTab, enabledCount,
}: Props) {
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const handleExport = async () => {
    const defaultPath = `devdash-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const target = await save({ defaultPath, filters: [{ name: "JSON", extensions: ["json"] }] });
    if (!target) return;
    try {
      const count = await invoke<number>("export_backup", { targetPath: target });
      setBackupStatus(`Exported ${count} file(s) to ${target}`);
    } catch (e) {
      setBackupStatus(`Export failed: ${e}`);
    }
  };

  const handleImport = async () => {
    const confirmed = await confirmUnless(false, "Import will overwrite your current notes, tasks, journal, connections, and settings with the backup's contents. Continue?", { title: "Import backup", kind: "warning" });
    if (!confirmed) return;

    const source = await open({ multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] });
    if (!source) return;
    try {
      const restored = await invoke<string[]>("import_backup", { sourcePath: source as string });
      setBackupStatus(`Restored ${restored.length} file(s). Restart DevDash to see changes.`);
    } catch (e) {
      setBackupStatus(`Import failed: ${e}`);
    }
  };
  return (

    <Flyout>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 6 }}>Dock Opacity</div>
      <input type="range" min="0.15" max="0.9" step="0.05" value={opacity} onChange={(e) => setOpacity(parseFloat(e.target.value))} style={{ width: "100%", accentColor: "var(--accent)" }} />

      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", margin: "14px 0 6px" }}>Accent Color</div>
      <div style={{ display: "flex", gap: 8 }}>
        {ACCENT_PRESETS.map((preset) => (
          <div key={preset.value} onClick={() => setAccent(preset.value)} title={preset.name} style={{
            width: 22, height: 22, borderRadius: "50%", background: preset.value, cursor: "pointer",
            border: accent === preset.value ? "2px solid white" : "2px solid transparent", boxSizing: "border-box",
          }} />
        ))}
      </div>

      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", margin: "14px 0 6px" }}>Default Editor</div>
      <EditorPicker value={defaultEditor} onChange={setDefaultEditor} editors={editors} />
      {editors.length === 0 && (
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>Scanning for installed editors…</div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>Skip confirmation dialogs</span>
        <div onClick={() => setSkipConfirmations(!skipConfirmations)} style={{
          width: 34, height: 18, borderRadius: 9, cursor: "pointer",
          background: skipConfirmations ? "var(--accent)" : "rgba(255,255,255,0.15)",
          position: "relative", transition: "background 0.15s ease",
        }}>
          <div style={{ width: 14, height: 14, borderRadius: "50%", background: "white", position: "absolute", top: 2, left: skipConfirmations ? 18 : 2, transition: "left 0.15s ease" }} />
        </div>
      </div>

      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", margin: "14px 0 6px" }}>
        Tabs ({enabledCount} enabled, min {MIN_ENABLED_TABS})
      </div>
      {tabs.map((tab, i) => {
        const config = TAB_REGISTRY[tab.id];
        const Icon = config.icon;
        const atMin = tab.enabled && enabledCount <= MIN_ENABLED_TABS;
        return (
          <div key={tab.id} style={{
            display: "flex", alignItems: "center", gap: 8, padding: "5px 0",
            opacity: tab.enabled ? 1 : 0.4,
          }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <ChevronUp size={11} onClick={() => moveTab(tab.id, -1)} style={{ cursor: i === 0 ? "default" : "pointer", opacity: i === 0 ? 0.2 : 0.6 }} />
              <ChevronDown size={11} onClick={() => moveTab(tab.id, 1)} style={{ cursor: i === tabs.length - 1 ? "default" : "pointer", opacity: i === tabs.length - 1 ? 0.2 : 0.6 }} />
            </div>
            <Icon size={14} color={tab.enabled ? "#e8e8e8" : "rgba(255,255,255,0.4)"} />
            <span style={{ fontSize: 12, flex: 1 }}>{config.label}</span>
            <div
              onClick={() => toggleTab(tab.id)}
              title={atMin ? `At least ${MIN_ENABLED_TABS} tabs must stay enabled` : undefined}
              style={{
                width: 34, height: 18, borderRadius: 9, cursor: atMin ? "not-allowed" : "pointer",
                background: tab.enabled ? "var(--accent)" : "rgba(255,255,255,0.15)",
                position: "relative", transition: "background 0.15s ease",
              }}
            >
              <div style={{ width: 14, height: 14, borderRadius: "50%", background: "white", position: "absolute", top: 2, left: tab.enabled ? 18 : 2, transition: "left 0.15s ease" }} />
            </div>
          </div>
        );
      })}

      <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 6 }}>
          Backup
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          <FlyoutButton onClick={handleExport}>export all data</FlyoutButton>
          <FlyoutButton onClick={handleImport}>import backup</FlyoutButton>
        </div>
        {backupStatus && (
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{backupStatus}</div>
        )}
      </div>
    </Flyout>
  );
}
