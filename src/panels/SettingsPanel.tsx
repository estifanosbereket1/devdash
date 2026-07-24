import { Flyout, EditorPicker } from "../Flyout";
import { ACCENT_PRESETS } from "../hooks/useSettings";

type Props = {
  opacity: number;
  setOpacity: (v: number) => void;
  accent: string;
  setAccent: (v: string) => void;
  defaultEditor: string;
  setDefaultEditor: (v: string) => void;
  skipConfirmations: boolean;
  setSkipConfirmations: (v: boolean) => void;
};

export function SettingsPanel({ opacity, setOpacity, accent, setAccent, defaultEditor, setDefaultEditor, skipConfirmations, setSkipConfirmations }: Props) {
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
      <EditorPicker value={defaultEditor} onChange={setDefaultEditor} />

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
    </Flyout>
  );
}
