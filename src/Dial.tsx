type DetailRow = { label: string; value: string };

type DialProps = {
  id: string;
  ratio: number;
  label: string;
  value: string;
  size?: number;
  active: boolean;
  onToggle: (id: string) => void;
};

export function Dial({ id, ratio, label, value, size = 56, active, onToggle }: DialProps) {
  const radius = size / 2 - 4;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.75;
  const offset = arcLength - ratio * arcLength;
  const center = size / 2;

  return (
    <div
      onClick={() => onToggle(id)}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer" }}
    >
      <svg width={size} height={size} style={{ transform: "rotate(135deg)" }}>
        <circle cx={center} cy={center} r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={4} strokeDasharray={`${arcLength} ${circumference}`} strokeLinecap="round" />
        <circle cx={center} cy={center} r={radius} fill="none" stroke={active ? "#5eead4" : "var(--accent)"} strokeWidth={4} strokeDasharray={`${arcLength} ${circumference}`} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.4s ease, stroke 0.2s ease" }} />
      </svg>
      <div style={{ marginTop: -size * 0.55, textAlign: "center" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 500, color: "#e8e8e8" }}>{value}</div>
      </div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: size * 0.4 }}>{label}</div>
    </div>
  );
}

export function DetailPanel({ rows }: { rows: DetailRow[] }) {
  return (
    <div style={{ display: "flex", gap: 24, padding: "10px 16px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
      {rows.map((r) => (
        <div key={r.label}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>{r.label}</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: "#e8e8e8" }}>{r.value}</div>
        </div>
      ))}
    </div>
  );
}
