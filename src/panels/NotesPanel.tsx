type Props = { notes: string; updateNotes: (v: string) => void; saved: boolean };

export function NotesPanel({ notes, updateNotes, saved }: Props) {
  return (
    <div style={{ padding: "10px 16px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>Notes</span>
        <span style={{ fontSize: 10, color: saved ? "rgba(255,255,255,0.3)" : "var(--accent)" }}>{saved ? "saved" : "saving..."}</span>
      </div>
      <textarea
        value={notes}
        onChange={(e) => updateNotes(e.target.value)}
        placeholder="Scratchpad..."
        style={{
          width: "100%", height: 220, resize: "none",
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8, color: "#e8e8e8", fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
          padding: 10, outline: "none",
        }}
      />
    </div>
  );
}
