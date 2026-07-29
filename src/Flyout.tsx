import { ReactNode, useState } from "react";
import type { ComponentType } from "react";
import { FolderOpen, X, Code2 } from "lucide-react";
import {
  SiZedindustries, SiSublimetext, SiAndroidstudio, SiPycharm, SiPhpstorm,
  SiIntellijidea, SiWebstorm, SiGoland, SiRider, SiClion, SiEclipseide,
} from "@icons-pack/react-simple-icons";
import type { EditorInfo } from "./types";

type IconComponent = ComponentType<{ size?: number | string; color?: string }>;

// Fallback shown before the machine scan resolves or if nothing was detected at all,
// so the picker never renders empty.
const FALLBACK_EDITORS: EditorInfo[] = [
  { id: "vscode", label: "VS Code", command: "code", color: "#519aba", kinds: [] },
  { id: "zed", label: "Zed", command: "zed", color: "#ff9f5b", kinds: [] },
];

// Real brand marks where available (simple-icons). VS Code has no icon there
// (trademark removed from the dataset) and RustRover isn't published yet —
// both fall back to a generic editor glyph via EDITOR_ICON_FALLBACK below.
const EDITOR_ICONS: Record<string, IconComponent> = {
  zed: SiZedindustries,
  sublime: SiSublimetext,
  androidstudio: SiAndroidstudio,
  pycharm: SiPycharm,
  phpstorm: SiPhpstorm,
  intellij: SiIntellijidea,
  webstorm: SiWebstorm,
  goland: SiGoland,
  rider: SiRider,
  clion: SiClion,
  eclipse: SiEclipseide,
};
const EDITOR_ICON_FALLBACK: IconComponent = Code2;

export function EditorPicker({ value, onChange, editors }: { value: string; onChange: (id: string) => void; editors?: EditorInfo[] }) {
  const list = editors && editors.length > 0 ? editors : FALLBACK_EDITORS;
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {list.map((editor) => {
        const active = value === editor.id || value === editor.command;
        const Icon = EDITOR_ICONS[editor.id] ?? EDITOR_ICON_FALLBACK;
        return (
          <div
            key={editor.id}
            onClick={() => onChange(editor.id)}
            title={editor.label}
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              background: active ? `${editor.color}26` : "rgba(255,255,255,0.05)",
              border: active ? `1px solid ${editor.color}` : "1px solid rgba(255,255,255,0.1)",
              transition: "all 0.15s ease",
            }}
          >
            <Icon size={13} color={active ? editor.color : "rgba(255,255,255,0.4)"} />
          </div>
        );
      })}
    </div>
  );
}


export function RootChip({ path, onRemove }: { path: string; onRemove?: () => void }) {
  const folderName = path.split("/").filter(Boolean).pop() ?? path;
  return (
    <div title={path} style={{
      display: "flex", alignItems: "center", gap: 4,
      background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 6, padding: "3px 8px", fontSize: 11, color: "rgba(255,255,255,0.7)",
    }}>
      <FolderOpen size={11} style={{ opacity: 0.5 }} />
      {folderName}
      {onRemove && (
        <X size={11} onClick={onRemove} style={{ cursor: "pointer", opacity: 0.5, marginLeft: 2 }} />
      )}
    </div>
  );
}


export function Flyout({ children }: { children: ReactNode }) {
  return (
    <div style={{
      borderTop: "1px solid rgba(255,255,255,0.08)",
      maxHeight: 320,
      overflowY: "auto",
      padding: "12px 16px",
    }}>
      {children}
    </div>
  );
}

export function FlyoutRow({ title, subtitle, status, statusColor, actions }: {
  title: ReactNode;
  subtitle?: ReactNode;
  status?: string;
  statusColor?: string;
  actions?: ReactNode;
}) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "8px 0",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
    }}>
      <div>
        <div style={{ fontSize: 13, color: "#e8e8e8" }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{subtitle}</div>}
        {status && <div style={{ fontSize: 11, color: statusColor ?? "rgba(255,255,255,0.5)" }}>{status}</div>}
      </div>
      {actions && <div style={{ display: "flex", gap: 6 }}>{actions}</div>}
    </div>
  );
}

export function FlyoutButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 6,
        color: "#e8e8e8",
        fontSize: 11,
        padding: "3px 8px",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      {children}
    </button>
  );
}

export function CommandButton({ label, command, onClick, disabled }: {
  label: string; command: string; onClick: () => void; disabled?: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div style={{ position: "relative" }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <FlyoutButton onClick={onClick} disabled={disabled}>{label}</FlyoutButton>
      {hover && (
        <div style={{
          position: "absolute", bottom: "130%", left: "50%", transform: "translateX(-50%)",
          background: "#14161c", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6,
          padding: "4px 8px", fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
          color: "var(--accent)", whiteSpace: "nowrap", zIndex: 20, pointerEvents: "none",
        }}>
          {command}
        </div>
      )}
    </div>
  );
}
