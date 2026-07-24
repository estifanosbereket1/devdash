import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Store } from "@tauri-apps/plugin-store";
import type { TrackInfo, RepeatMode } from "../types";

export function useMusicRoots() {
  const [roots, setRoots] = useState<string[]>([]);
  const [store, setStore] = useState<Store | null>(null);

  useEffect(() => {
    Store.load("music-roots.json").then(async (s) => {
      setStore(s);
      setRoots((await s.get<string[]>("roots")) ?? []);
    });
  }, []);

  const addRoot = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (!selected || !store) return;
    const updated = [...new Set([...roots, selected as string])];
    setRoots(updated);
    await store.set("roots", updated);
    await store.save();
  };

  const removeMusicRoot = async (path: string) => {
    if (!store) return;
    const updated = roots.filter((r) => r !== path);
    setRoots(updated);
    await store.set("roots", updated);
    await store.save();
  };

  return { roots, addRoot, removeMusicRoot };
}

export function useMusicLibrary(roots: string[]) {
  const [tracks, setTracks] = useState<TrackInfo[]>([]);
  const [scanning, setScanning] = useState(false);
  const [store, setStore] = useState<Store | null>(null);
  const [hasLoadedCache, setHasLoadedCache] = useState(false);

  useEffect(() => {
    Store.load("music-library.json").then(async (s) => {
      setStore(s);
      const cached = await s.get<TrackInfo[]>("tracks").catch(() => null);
      if (cached && cached.length > 0) setTracks(cached);
      setHasLoadedCache(true);
    });
  }, []);

  const scan = async () => {
    if (roots.length === 0) return;
    setScanning(true);
    try {
      const result = await invoke<TrackInfo[]>("scan_music_library", { roots });
      setTracks(result);
      if (store) {
        await store.set("tracks", result);
        await store.save();
      }
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    if (hasLoadedCache && tracks.length === 0 && roots.length > 0) scan();
  }, [hasLoadedCache, roots]);

  return { tracks, scan, scanning };
}

export function usePlayer() {
  const [baseList, setBaseList] = useState<TrackInfo[]>([]);
  const [order, setOrder] = useState<number[]>([]);
  const [pointer, setPointer] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [shuffle, setShuffleState] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");

  const current = baseList[order[pointer]] ?? null;

  const shuffleIndices = (len: number, keepFirst: number): number[] => {
    const rest = Array.from({ length: len }, (_, i) => i).filter((i) => i !== keepFirst);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    return [keepFirst, ...rest];
  };

  const playAtPointer = async (list: TrackInfo[], newOrder: number[], newPointer: number) => {
    const track = list[newOrder[newPointer]];
    if (!track) return;
    await invoke("play_track", { path: track.path });
    setBaseList(list);
    setOrder(newOrder);
    setPointer(newPointer);
    setPlaying(true);
    setPosition(0);
  };

  const play = (track: TrackInfo, list: TrackInfo[]) => {
    const startIdx = list.findIndex((t) => t.path === track.path);
    const safeStart = startIdx >= 0 ? startIdx : 0;
    const newOrder = shuffle ? shuffleIndices(list.length, safeStart) : Array.from({ length: list.length }, (_, i) => i);
    const newPointer = shuffle ? 0 : safeStart;
    playAtPointer(list, newOrder, newPointer);
  };

  const toggleShuffle = () => {
    const next = !shuffle;
    setShuffleState(next);
    if (baseList.length === 0) return;
    const currentTrackIdx = order[pointer];
    const newOrder = next ? shuffleIndices(baseList.length, currentTrackIdx) : Array.from({ length: baseList.length }, (_, i) => i);
    setOrder(newOrder);
    setPointer(next ? 0 : currentTrackIdx);
  };

  const cycleRepeat = () => setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off"));

  const next = () => {
    if (repeat === "one") playAtPointer(baseList, order, pointer);
    else if (pointer + 1 < order.length) playAtPointer(baseList, order, pointer + 1);
    else if (repeat === "all") playAtPointer(baseList, order, 0);
    else setPlaying(false);
  };

  const prev = () => {
    if (pointer > 0) playAtPointer(baseList, order, pointer - 1);
    else if (repeat === "all") playAtPointer(baseList, order, order.length - 1);
  };

  const togglePause = async () => {
    if (playing) await invoke("pause_playback");
    else await invoke("resume_playback");
    setPlaying(!playing);
  };

  const seek = async (secs: number) => {
    await invoke("seek_playback", { positionSecs: secs });
    setPosition(secs);
  };

  const setVolume = async (v: number) => {
    setVolumeState(v);
    await invoke("set_volume", { volume: v });
  };

  useEffect(() => {
    if (!current || !playing) return;
    const id = setInterval(() => {
      invoke<number>("get_playback_position").then((pos) => {
        setPosition(pos);
        if (current.duration_secs > 0 && pos >= current.duration_secs - 0.5) next();
      });
    }, 500);
    return () => clearInterval(id);
  }, [current, playing, order, pointer, repeat]);

  return {
    current, playing, play, togglePause, volume, setVolume, position, seek, next, prev,
    hasNext: repeat !== "off" || pointer + 1 < order.length,
    hasPrev: repeat === "all" || pointer > 0,
    shuffle, toggleShuffle, repeat, cycleRepeat,
  };
}
