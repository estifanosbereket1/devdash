import { ReactNode } from "react";

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
