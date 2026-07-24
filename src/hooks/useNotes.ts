import { useEffect, useState } from "react";
import { Store } from "@tauri-apps/plugin-store";

export function useNotes() {
  const [store, setStore] = useState<Store | null>(null);
  const [notes, setNotesState] = useState("");
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    Store.load("notes.json").then(async (s) => {
      setStore(s);
      const saved = await s.get<string>("content").catch(() => null);
      if (saved !== null && saved !== undefined) setNotesState(saved);
    });
  }, []);

  const updateNotes = (value: string) => {
    setNotesState(value);
    setSaved(false);
  };

  useEffect(() => {
    if (!store || saved) return;
    const timeout = setTimeout(async () => {
      await store.set("content", notes);
      await store.save();
      setSaved(true);
    }, 500);
    return () => clearTimeout(timeout);
  }, [notes, store, saved]);

  return { notes, updateNotes, saved };
}
