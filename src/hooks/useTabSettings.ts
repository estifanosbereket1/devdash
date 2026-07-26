import { useEffect, useState } from "react";
import { Store } from "@tauri-apps/plugin-store";
import { DEFAULT_TAB_IDS, MIN_ENABLED_TABS, type TabId } from "../tabRegistry";

type TabConfig = { id: TabId; enabled: boolean };

export function useTabSettings() {
  const [store, setStore] = useState<Store | null>(null);
  const [tabs, setTabs] = useState<TabConfig[]>(DEFAULT_TAB_IDS.map((id) => ({ id, enabled: true })));

  useEffect(() => {
    Store.load("settings.json").then(async (s) => {
      setStore(s);
      const saved = await s.get<TabConfig[]>("tabConfig").catch(() => null);
      if (saved && saved.length > 0) {
        // merge in any tab ids that didn't exist yet when this was last saved (future-proofing)
        const savedIds = new Set(saved.map((t) => t.id));
        const missing = DEFAULT_TAB_IDS.filter((id) => !savedIds.has(id)).map((id) => ({ id, enabled: true }));
        setTabs([...saved, ...missing]);
      }
    });
  }, []);

  const persist = async (updated: TabConfig[]) => {
    setTabs(updated);
    if (store) {
      await store.set("tabConfig", updated);
      await store.save();
    }
  };

  const enabledCount = tabs.filter((t) => t.enabled).length;

  const toggleTab = (id: TabId) => {
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return;
    if (tab.enabled && enabledCount <= MIN_ENABLED_TABS) return; // hard floor, silently refuse
    persist(tabs.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t)));
  };

  const moveTab = (id: TabId, direction: -1 | 1) => {
    const idx = tabs.findIndex((t) => t.id === id);
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= tabs.length) return;
    const updated = [...tabs];
    [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
    persist(updated);
  };

  const visibleTabs: TabId[] = tabs.filter((t) => t.enabled).map((t) => t.id);

  return { tabs, visibleTabs, toggleTab, moveTab, enabledCount };
}
