import { ReactNode } from "react";
const EDITORS = [
  { id: "vscode", label: "VS", color: "#519aba" },
  { id: "zed", label: "Z", color: "#ff9f5b" },
];

export function EditorPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {EDITORS.map((editor) => {
        const active = value === editor.id;
        return (
          <div
            key={editor.id}
            onClick={() => onChange(editor.id)}
            title={editor.id === "vscode" ? "VS Code" : "Zed"}
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
            {editor.label}
          </div>
        );
      })}
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
  title: string;
  subtitle?: string;
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
