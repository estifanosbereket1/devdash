import { useEffect, useMemo, useRef, useState } from "react";

export type PaletteItem = {
  id: string;
  section: string;
  label: string;
  sublabel?: string;
  keywords?: string;
  onSelect: () => void;
};

function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (!q) return 1;
  if (t.includes(q)) return 100 - t.indexOf(q);
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length ? 10 : -1;
}

export function CommandPalette({
  open, onClose, items, extraItemsForQuery, scoreOf,
}: {
  open: boolean;
  onClose: () => void;
  items: PaletteItem[];
  extraItemsForQuery?: (query: string) => PaletteItem[];
  scoreOf?: (id: string) => number;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const results = useMemo(() => {
    const extras = extraItemsForQuery?.(query) ?? [];
    if (!query.trim()) {
      const recent = scoreOf
        ? [...items]
            .filter((i) => (scoreOf(i.id) ?? 0) > 0)
            .sort((a, b) => (scoreOf(b.id) ?? 0) - (scoreOf(a.id) ?? 0))
            .slice(0, 5)
            .map((i) => ({ ...i, id: `recent:${i.id}`, section: "Recent" }))
        : [];
      return [...extras, ...recent, ...items.slice(0, 30)];
    }
    const matched = items
      .map((item) => ({
        item,
        score: Math.max(fuzzyScore(query, item.label), fuzzyScore(query, item.keywords ?? "") - 5),
      }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map((r) => r.item);
    return [...extras, ...matched];
  }, [query, items, extraItemsForQuery, scoreOf]);

  useEffect(() => setSelected(0), [query]);

  if (!open) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); results[selected]?.onSelect(); onClose(); }
    else if (e.key === "Escape") { onClose(); }
  };

  let lastSection = "";

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", paddingTop: 80, zIndex: 1000 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 480, maxHeight: 400, display: "flex", flexDirection: "column", background: "#14161c", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search everything, or type a command like 'kill 3000'"
          style={{ padding: "12px 14px", background: "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.08)", color: "#e8e8e8", fontSize: 14, fontFamily: "'JetBrains Mono', monospace", outline: "none" }}
        />
        <div style={{ overflowY: "auto", padding: "6px 0" }}>
          {results.length === 0 && (
            <div style={{ padding: "16px 14px", fontSize: 12, color: "rgba(255,255,255,0.4)" }}>No results</div>
          )}
          {results.map((item, i) => {
            const showHeader = item.section !== lastSection;
            lastSection = item.section;
            return (
              <div key={item.id}>
                {showHeader && (
                  <div style={{ padding: "6px 14px 2px", fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase" }}>{item.section}</div>
                )}
                <div
                  onClick={() => { item.onSelect(); onClose(); }}
                  onMouseEnter={() => setSelected(i)}
                  style={{ padding: "8px 14px", cursor: "pointer", fontSize: 13, background: i === selected ? "rgba(255,255,255,0.08)" : "transparent", color: i === selected ? "var(--accent)" : "#e8e8e8", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                >
                  <span>{item.label}</span>
                  {item.sublabel && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{item.sublabel}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
