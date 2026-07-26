import { useEffect, useState } from "react";
import { Store } from "@tauri-apps/plugin-store";
import type { JournalEntry } from "../types";

export function useJournalEntries() {
  const [store, setStore] = useState<Store | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);

  useEffect(() => {
    Store.load("journal-entries.json").then(async (s) => {
      setStore(s);
      setEntries((await s.get<JournalEntry[]>("entries")) ?? []);
    });
  }, []);

  const persist = async (updated: JournalEntry[]) => {
    setEntries(updated);
    if (store) {
      await store.set("entries", updated);
      await store.save();
    }
  };

  const addEntry = (title: string, date: string) => {
    const entry: JournalEntry = {
      id: crypto.randomUUID(),
      title: title.trim() || "Untitled",
      date,
      content: "",
      updatedAt: Date.now(),
    };
    persist([entry, ...entries]);
    return entry;
  };

  const updateEntry = (id: string, patch: Partial<Omit<JournalEntry, "id">>) => {
    persist(entries.map((e) => (e.id === id ? { ...e, ...patch, updatedAt: Date.now() } : e)));
  };

  const deleteEntry = (id: string) => {
    persist(entries.filter((e) => e.id !== id));
  };

  return { entries, addEntry, updateEntry, deleteEntry };
}
