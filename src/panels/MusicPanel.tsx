import { useState } from "react";
import { Shuffle, SkipBack, SkipForward, Repeat, Repeat1, Play, Pause } from "lucide-react";
import { Flyout, FlyoutRow, FlyoutButton, RootChip } from "../Flyout";
import { formatTime } from "../utils";
import type { TrackInfo } from "../types";

type Props = {
  musicRoots: string[];
  addMusicRoot: () => void;
  removeMusicRoot: (path: string) => void;
  tracks: TrackInfo[];
  scanLibrary: () => void;
  scanning: boolean;
  current: TrackInfo | null;
  playing: boolean;
  play: (track: TrackInfo, list: TrackInfo[]) => void;
  togglePause: () => void;
  volume: number;
  setVolume: (v: number) => void;
  position: number;
  seek: (secs: number) => void;
  next: () => void;
  prev: () => void;
  hasNext: boolean;
  hasPrev: boolean;
  shuffle: boolean;
  toggleShuffle: () => void;
  repeat: "off" | "all" | "one";
  cycleRepeat: () => void;
};

export function MusicPanel(props: Props) {
  const { musicRoots, addMusicRoot, removeMusicRoot, tracks, scanLibrary, scanning,
    current, playing, play, togglePause, volume, setVolume, position, seek,
    next, prev, hasNext, hasPrev, shuffle, toggleShuffle, repeat, cycleRepeat } = props;

  const [trackSearch, setTrackSearch] = useState("");
  const filteredTracks = tracks.filter((t) => {
    if (trackSearch.trim() === "") return true;
    const q = trackSearch.toLowerCase();
    return t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q) || t.album.toLowerCase().includes(q);
  });

  return (
    <Flyout>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <FlyoutButton onClick={addMusicRoot}>add folder</FlyoutButton>
        <FlyoutButton onClick={scanLibrary} disabled={scanning}>{scanning ? "scanning..." : "scan"}</FlyoutButton>
      </div>
      <input
        type="text" placeholder="Search tracks..." value={trackSearch} onChange={(e) => setTrackSearch(e.target.value)}
        style={{ width: "100%", marginBottom: 8, padding: "6px 8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#e8e8e8", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {musicRoots.map((r) => <RootChip key={r} path={r} onRemove={() => removeMusicRoot(r)} />)}
      </div>

      {current && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 10px", marginBottom: 10, background: "rgba(255,255,255,0.04)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Shuffle size={14} onClick={toggleShuffle} style={{ cursor: "pointer", color: shuffle ? "var(--accent)" : "rgba(255,255,255,0.4)" }} />
            <SkipBack size={16} onClick={hasPrev ? prev : undefined} style={{ cursor: hasPrev ? "pointer" : "default", opacity: hasPrev ? 1 : 0.3, color: "#e8e8e8" }} />
            {playing ? <Pause size={18} onClick={togglePause} style={{ cursor: "pointer", color: "var(--accent)" }} /> : <Play size={18} onClick={togglePause} style={{ cursor: "pointer", color: "var(--accent)" }} />}
            <SkipForward size={16} onClick={hasNext ? next : undefined} style={{ cursor: hasNext ? "pointer" : "default", opacity: hasNext ? 1 : 0.3, color: "#e8e8e8" }} />
            {repeat === "one" ? <Repeat1 size={14} onClick={cycleRepeat} style={{ cursor: "pointer", color: "var(--accent)" }} /> : <Repeat size={14} onClick={cycleRepeat} style={{ cursor: "pointer", color: repeat === "all" ? "var(--accent)" : "rgba(255,255,255,0.4)" }} />}
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div style={{ fontSize: 12, color: "#e8e8e8", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{current.title}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{current.artist}</div>
            </div>
            <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} style={{ width: 70, accentColor: "var(--accent)" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontFamily: "'JetBrains Mono', monospace", minWidth: 28 }}>{formatTime(position)}</span>
            <input type="range" min="0" max={current.duration_secs || 1} step="1" value={position} onChange={(e) => seek(parseFloat(e.target.value))} style={{ flex: 1, accentColor: "var(--accent)" }} />
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontFamily: "'JetBrains Mono', monospace", minWidth: 28 }}>{formatTime(current.duration_secs)}</span>
          </div>
        </div>
      )}

      {filteredTracks.map((t) => (
        <FlyoutRow
          key={t.path}
          title={t.title}
          subtitle={`${t.artist} · ${t.album}`}
          status={current?.path === t.path ? (playing ? "▶ playing" : "⏸ paused") : undefined}
          statusColor={current?.path === t.path ? "#5eead4" : undefined}
          actions={<FlyoutButton onClick={() => (current?.path === t.path ? togglePause() : play(t, filteredTracks))}>{current?.path === t.path && playing ? "pause" : "play"}</FlyoutButton>}
        />
      ))}
    </Flyout>
  );
}
