import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";
import type { DbConnection, QueryResult , DiscoveredServer } from "../types";

export function useDbConnections() {
  const [store, setStore] = useState<Store | null>(null);
  const [connections, setConnections] = useState<DbConnection[]>([]);

  useEffect(() => {
    Store.load("db-connections.json").then(async (s) => {
      setStore(s);
      setConnections((await s.get<DbConnection[]>("connections")) ?? []);
    });
  }, []);

  const persist = async (updated: DbConnection[]) => {
    setConnections(updated);
    if (store) {
      await store.set("connections", updated);
      await store.save();
    }
  };

  const addConnection = (conn: Omit<DbConnection, "id">) => {
    persist([...connections, { ...conn, id: crypto.randomUUID() }]);
  };

  const deleteConnection = (id: string) => {
    persist(connections.filter((c) => c.id !== id));
  };

  return { connections, addConnection, deleteConnection };
}

export function useDbBrowser() {
  const [databases, setDatabases] = useState<string[]>([]);
  const [tables, setTables] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDatabases = async (conn: DbConnection) => {
    setLoading(true);
    setError(null);
    setTables([]);
    try {
      setDatabases(await invoke<string[]>("list_databases", conn));
    } catch (e) {
      setError(e as string);
      setDatabases([]);
    } finally {
      setLoading(false);
    }
  };

  const loadTables = async (conn: DbConnection, database: string) => {
    setLoading(true);
    setError(null);
    try {
      setTables(await invoke<string[]>("list_tables", { ...conn, database }));
    } catch (e) {
      setError(e as string);
      setTables([]);
    } finally {
      setLoading(false);
    }
  };

  return { databases, tables, loading, error, loadDatabases, loadTables, setTables };
}

export function useQueryRunner() {
  const [result, setResult] = useState<QueryResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runQuery = async (conn: DbConnection, database: string, sql: string) => {
    setRunning(true);
    setError(null);
    try {
      setResult(await invoke<QueryResult>("run_query", { ...conn, database, sql }));
    } catch (e) {
      setError(e as string);
      setResult(null);
    } finally {
      setRunning(false);
    }
  };

  return { result, running, error, runQuery };
}

export function useDiscoveredServers(sqliteRoots: string[]) {
  const [servers, setServers] = useState<DiscoveredServer[]>([]);
  const [scanning, setScanning] = useState(false);

  const scan = async () => {
    setScanning(true);
    try {
      setServers(await invoke<DiscoveredServer[]>("discover_databases", { sqliteRoots }));
    } catch (e) {
      console.error("discover_databases failed:", e);
      setServers([]);
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => { scan(); }, []);

  return { servers, scanning, rescan: scan };
}
