import { useEffect, useState } from "react";
import { Store } from "@tauri-apps/plugin-store";

export const ACCENT_PRESETS = [
  { name: "Amber", value: "#ff9f5b" },
  { name: "Teal", value: "#5eead4" },
  { name: "Violet", value: "#a78bfa" },
  { name: "Rose", value: "#fb7185" },
  { name: "Sky", value: "#38bdf8" },
];

export function useOpacitySetting() {
  const [store, setStore] = useState<Store | null>(null);
  const [opacity, setOpacityState] = useState(0.55);

  useEffect(() => {
    Store.load("settings.json").then(async (s) => {
      setStore(s);
      const saved = await s.get<number>("dockOpacity").catch(() => null);
      if (saved !== null && saved !== undefined) setOpacityState(saved);
    });
  }, []);

  const setOpacity = async (value: number) => {
    setOpacityState(value);
    document.documentElement.style.setProperty("--dock-opacity", value.toString());
    if (store) {
      await store.set("dockOpacity", value);
      await store.save();
    }
  };

  return { opacity, setOpacity };
}

export function useAccentSetting() {
  const [store, setStore] = useState<Store | null>(null);
  const [accent, setAccentState] = useState("#ff9f5b");

  useEffect(() => {
    Store.load("settings.json").then(async (s) => {
      setStore(s);
      const saved = await s.get<string>("accentColor").catch(() => null);
      if (saved) setAccentState(saved);
    });
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", accent);
  }, [accent]);

  const setAccent = async (value: string) => {
    setAccentState(value);
    if (store) {
      await store.set("accentColor", value);
      await store.save();
    }
  };

  return { accent, setAccent };
}

export function useDefaultEditor() {
  const [store, setStore] = useState<Store | null>(null);
  const [defaultEditor, setDefaultEditorState] = useState("vscode");

  useEffect(() => {
    Store.load("settings.json").then(async (s) => {
      setStore(s);
      const saved = await s.get<string>("defaultEditor").catch(() => null);
      if (saved) setDefaultEditorState(saved);
    });
  }, []);

  const setDefaultEditor = async (value: string) => {
    setDefaultEditorState(value);
    if (store) {
      await store.set("defaultEditor", value);
      await store.save();
    }
  };

  return { defaultEditor, setDefaultEditor };
}

export function useConfirmationsSetting() {
  const [store, setStore] = useState<Store | null>(null);
  const [skipConfirmations, setSkipState] = useState(false);

  useEffect(() => {
    Store.load("settings.json").then(async (s) => {
      setStore(s);
      const saved = await s.get<boolean>("skipConfirmations").catch(() => null);
      if (saved !== null && saved !== undefined) setSkipState(saved);
    });
  }, []);

  const setSkipConfirmations = async (value: boolean) => {
    setSkipState(value);
    if (store) {
      await store.set("skipConfirmations", value);
      await store.save();
    }
  };

  return { skipConfirmations, setSkipConfirmations };
}
