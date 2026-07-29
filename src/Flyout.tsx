import { ReactNode, useState } from "react";
import { FolderOpen, X } from "lucide-react";
import type { EditorInfo } from "./types";

// Fallback shown before the machine scan resolves or if nothing was detected at all,
// so the picker never renders empty.
const FALLBACK_EDITORS: EditorInfo[] = [
  { id: "vscode", label: "VS Code", command: "code", color: "#519aba", kinds: [] },
  { id: "zed", label: "Zed", command: "zed", color: "#ff9f5b", kinds: [] },
];

// Short glyph shown in the compact picker button, derived from the label.
function abbreviate(label: string): string {
  const words = label.split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return label.slice(0, 2).toUpperCase();
}

export function EditorPicker({ value, onChange, editors }: { value: string; onChange: (id: string) => void; editors?: EditorInfo[] }) {
  const list = editors && editors.length > 0 ? editors : FALLBACK_EDITORS;
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {list.map((editor) => {
        const active = value === editor.id || value === editor.command;
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
              fontSize: 10,
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 500,
              cursor: "pointer",
              background: active ? `${editor.color}26` : "rgba(255,255,255,0.05)",
              border: active ? `1px solid ${editor.color}` : "1px solid rgba(255,255,255,0.1)",
              color: active ? editor.color : "rgba(255,255,255,0.4)",
              transition: "all 0.15s ease",
            }}
          >
            {abbreviate(editor.label)}
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
