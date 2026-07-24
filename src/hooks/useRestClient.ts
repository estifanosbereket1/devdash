import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";
import type { HttpResponse, SavedRequest } from "../types";

export function useSavedRequests() {
  const [store, setStore] = useState<Store | null>(null);
  const [saved, setSaved] = useState<SavedRequest[]>([]);

  useEffect(() => {
    Store.load("rest-client.json").then(async (s) => {
      setStore(s);
      setSaved((await s.get<SavedRequest[]>("requests")) ?? []);
    });
  }, []);

  const persist = async (updated: SavedRequest[]) => {
    setSaved(updated);
    if (store) {
      await store.set("requests", updated);
      await store.save();
    }
  };

  const saveRequest = (req: Omit<SavedRequest, "id">) => {
    persist([...saved, { ...req, id: crypto.randomUUID() }]);
  };

  const deleteRequest = (id: string) => {
    persist(saved.filter((r) => r.id !== id));
  };

  return { saved, saveRequest, deleteRequest };
}

export function useRequestSender() {
  const [response, setResponse] = useState<HttpResponse | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (method: string, url: string, headers: { key: string; value: string }[], body: string) => {
    setSending(true);
    setError(null);
    try {
      const result = await invoke<HttpResponse>("send_http_request", {
        method,
        url,
        headers: headers.filter((h) => h.key.trim() !== "").map((h) => [h.key, h.value]),
        body: body.trim() === "" ? null : body,
      });
      setResponse(result);
    } catch (e) {
      setError(e as string);
      setResponse(null);
    } finally {
      setSending(false);
    }
  };

  return { response, sending, error, send };
}
