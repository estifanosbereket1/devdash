import { useEffect, useRef, useState } from "react";
import { Flyout, FlyoutButton } from "../Flyout";
import { useJournalEntries } from "../hooks/useJournal";
import {
  Bold, Italic, Underline, List, ListOrdered, Heading1, Heading2, Quote, Eraser,
} from "lucide-react";

const today = () => new Date().toISOString().slice(0, 10);

function formatDateDisplay(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function ToolbarButton({ onClick, icon: Icon, label }: { onClick: () => void; icon: any; label: string }) {
  return (
    <span
      onMouseDown={(e) => { e.preventDefault(); onClick(); }} // preventDefault keeps editor focus/selection intact
      title={label}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 24, height: 24, borderRadius: 4, cursor: "pointer",
        color: "rgba(255,255,255,0.6)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <Icon size={13} />
    </span>
  );
}

function RichTextEditor({ content, onChange }: { content: string; onChange: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (ref.current && !initialized.current) {
      ref.current.innerHTML = content;
      initialized.current = true;
    }
  }, [content]);

  const exec = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    ref.current?.focus();
    if (ref.current) onChange(ref.current.innerHTML);
  };

  return (
    <div>
      <div style={{
        display: "flex", gap: 2, padding: "4px 2px", marginBottom: 6,
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}>
        <ToolbarButton onClick={() => exec("bold")} icon={Bold} label="Bold" />
        <ToolbarButton onClick={() => exec("italic")} icon={Italic} label="Italic" />
        <ToolbarButton onClick={() => exec("underline")} icon={Underline} label="Underline" />
        <div style={{ width: 1, background: "rgba(255,255,255,0.1)", margin: "2px 4px" }} />
        <ToolbarButton onClick={() => exec("formatBlock", "<h2>")} icon={Heading1} label="Heading" />
        <ToolbarButton onClick={() => exec("formatBlock", "<h3>")} icon={Heading2} label="Subheading" />
        <ToolbarButton onClick={() => exec("formatBlock", "<blockquote>")} icon={Quote} label="Quote" />
        <div style={{ width: 1, background: "rgba(255,255,255,0.1)", margin: "2px 4px" }} />
        <ToolbarButton onClick={() => exec("insertUnorderedList")} icon={List} label="Bullet list" />
        <ToolbarButton onClick={() => exec("insertOrderedList")} icon={ListOrdered} label="Numbered list" />
        <div style={{ width: 1, background: "rgba(255,255,255,0.1)", margin: "2px 4px" }} />
        <ToolbarButton onClick={() => exec("removeFormat")} icon={Eraser} label="Clear formatting" />
      </div>

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        style={{
          minHeight: 220, maxHeight: 260, overflowY: "auto",
          fontSize: 13, lineHeight: 1.6, color: "#e8e8e8",
          outline: "none", padding: "4px 2px",
        }}
        data-placeholder="Write today's entry..."
      />
    </div>
  );
}

export function JournalPanel({
  openEntryId, onConsumeOpenEntry,
}: { openEntryId?: string; onConsumeOpenEntry?: () => void } = {}) {
  const { entries, addEntry, updateEntry, deleteEntry } = useJournalEntries();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");

  const active = entries.find((e) => e.id === activeId) ?? null;

  const inputStyle = {
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 6, color: "#e8e8e8", fontSize: 12, fontFamily: "inherit",
    padding: "6px 8px", outline: "none",
  } as const;

  const handleNewEntry = () => {
    const entry = addEntry(newTitle, today());
    setNewTitle("");
    setActiveId(entry.id);
  };

  useEffect(() => {
     if (openEntryId) {
       setActiveId(openEntryId);
       onConsumeOpenEntry?.();
     }
   }, [openEntryId]);

  return (
    <Flyout>
      {!active && (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <input
              placeholder="New entry title..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleNewEntry()}
              style={{ ...inputStyle, flex: 1 }}
            />
            <FlyoutButton onClick={handleNewEntry}>+ entry</FlyoutButton>
          </div>

          {entries.length === 0 && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
              No journal entries yet — write your first one above.
            </div>
          )}

          {entries
            .slice()
            .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt)
            .map((e) => (
              <div
                key={e.id}
                onClick={() => setActiveId(e.id)}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 10px", borderRadius: 6, cursor: "pointer", marginBottom: 4,
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: "#e8e8e8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {e.title}
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                    {formatDateDisplay(e.date)}
                  </div>
                </div>
                <span
                  onClick={(ev) => { ev.stopPropagation(); deleteEntry(e.id); }}
                  style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", flexShrink: 0, marginLeft: 8 }}
                >
                  delete
                </span>
              </div>
            ))}
        </>
      )}

      {active && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 12 }}>
            <span onClick={() => setActiveId(null)} style={{ cursor: "pointer", color: "var(--accent)" }}>
              ← entries
            </span>
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <input
              value={active.title}
              onChange={(e) => updateEntry(active.id, { title: e.target.value })}
              style={{ ...inputStyle, flex: 1, fontSize: 13, fontWeight: 600 }}
            />
            <input
              type="date"
              value={active.date}
              onChange={(e) => updateEntry(active.id, { date: e.target.value })}
              style={{ ...inputStyle, width: 130 }}
            />
          </div>

          <RichTextEditor
            key={active.id}
            content={active.content}
            onChange={(html) => updateEntry(active.id, { content: html })}
          />
        </>
      )}
    </Flyout>
  );
}
