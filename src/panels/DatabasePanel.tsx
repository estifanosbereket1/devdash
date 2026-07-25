import { useState } from "react";
import { useDiscoveredServers, useDbBrowser, useQueryRunner, useSavedConnections } from "../hooks/useDatabase";
import type { DiscoveredServer, DbConnection, DbProvider, SavedConnection } from "../types";
import { Flyout, FlyoutButton } from "../Flyout";
import { invoke } from "@tauri-apps/api/core";

const PROVIDER_COLORS: Record<DbProvider, string> = {
  postgres: "#5eead4", mysql: "#ff9f5b", sqlite: "#a78bfa",
};
const PROVIDER_LABELS: Record<DbProvider, string> = {
  postgres: "PostgreSQL", mysql: "MySQL", sqlite: "SQLite",
};
const PROVIDER_ORDER: DbProvider[] = ["postgres", "mysql", "sqlite"];

function RemoteConnectionForm({
  onSave, onCancel, testing, testError,
}: {
  onSave: (c: Omit<SavedConnection, "id">) => Promise<void>;
  onCancel: () => void;
  testing: boolean;
  testError: string | null;
}) {
  const [provider, setProvider] = useState<DbProvider>("postgres");
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("5432");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [database, setDatabase] = useState("");
  const [sslMode, setSslMode] = useState("require");

  const style = {
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 6, color: "#e8e8e8", fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
    padding: "6px 8px", outline: "none",
  } as const;

  return (
    <div style={{ padding: 10, background: "rgba(255,255,255,0.03)", borderRadius: 8, marginBottom: 10 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        {(["postgres", "mysql"] as DbProvider[]).map((p) => (
          <div
            key={p}
            onClick={() => { setProvider(p); setPort(p === "postgres" ? "5432" : "3306"); }}
            style={{
              padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11,
              background: provider === p ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${provider === p ? "var(--accent)" : "rgba(255,255,255,0.1)"}`,
              color: provider === p ? "var(--accent)" : "rgba(255,255,255,0.5)",
            }}
          >
            {p}
          </div>
        ))}
      </div>

      <input placeholder="Connection name" value={name} onChange={(e) => setName(e.target.value)} style={{ ...style, width: "100%", marginBottom: 6 }} />
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <input placeholder="Host" value={host} onChange={(e) => setHost(e.target.value)} style={{ ...style, flex: 2 }} />
        <input placeholder="Port" value={port} onChange={(e) => setPort(e.target.value)} style={{ ...style, flex: 1 }} />
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <input placeholder="User" value={user} onChange={(e) => setUser(e.target.value)} style={{ ...style, flex: 1 }} />
        <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ ...style, flex: 1 }} />
      </div>
      <input placeholder="Database name" value={database} onChange={(e) => setDatabase(e.target.value)} style={{ ...style, width: "100%", marginBottom: 6 }} />
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {["require", "disable"].map((mode) => (
          <span
            key={mode}
            onClick={() => setSslMode(mode)}
            style={{
              fontSize: 11, padding: "4px 10px", borderRadius: 6, cursor: "pointer",
              background: sslMode === mode ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${sslMode === mode ? "var(--accent)" : "rgba(255,255,255,0.1)"}`,
              color: sslMode === mode ? "var(--accent)" : "rgba(255,255,255,0.5)",
            }}
          >
            {mode === "require" ? "SSL required" : "No SSL"}
          </span>
        ))}
      </div>

      {testError && <div style={{ fontSize: 11, color: "#f87171", marginBottom: 6 }}>{testError}</div>}

      <div style={{ display: "flex", gap: 6 }}>
        <FlyoutButton
          onClick={() => onSave({ name: name || host, provider, host, port, user, password, database, sslMode })}
           disabled={testing || !host || !database}
        >
          {testing ? "testing..." : "test & save"}
        </FlyoutButton>
        <FlyoutButton onClick={onCancel}>cancel</FlyoutButton>
      </div>
    </div>
  );
}

export function DatabasePanel({ sqliteRoots = [] }: { sqliteRoots?: string[] }) {
  const { servers, scanning, rescan } = useDiscoveredServers(sqliteRoots);
  const { tables, loading, error, loadTables, setTables } = useDbBrowser();
  const { result, running, error: queryError, runQuery } = useQueryRunner();

  const { connections: remoteConnections, addConnection, deleteConnection } = useSavedConnections();
  const [showRemoteForm, setShowRemoteForm] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  const [activeConn, setActiveConn] = useState<DbConnection | null>(null);
  const [activeDb, setActiveDb] = useState<string | null>(null);
  const [sql, setSql] = useState("");

  const asConnection = (s: DiscoveredServer, database: string): DbConnection => ({
      id: `${s.provider}:${s.host}:${s.port}:${database}`,
      name: database, provider: s.provider, host: s.host, port: s.port,
      user: s.user, password: s.password, database,
      sslMode: "",   // ⬅️ ADD — discovered servers (local socket/TCP) never need SSL
    });

  const openDatabase = (s: DiscoveredServer, database: string) => {
    const conn = asConnection(s, database);
    setActiveConn(conn);
    setActiveDb(s.provider === "sqlite" ? database : database);
    setSql("");
    loadTables(conn, database);
  };

  const previewTable = (table: string) => {
    if (!activeConn || !activeDb) return;
    const query = `SELECT * FROM ${table} LIMIT 100`;
    setSql(query);
    runQuery(activeConn, activeDb, query);
  };

  const handleSaveRemote = async (conn: Omit<SavedConnection, "id">) => {
    setTesting(true);
    setTestError(null);
    try {
      // await invoke("test_db_connection", conn);
      await invoke("test_db_connection", { ...conn, sslmode: conn.sslMode ?? "" });
      addConnection(conn);
      setShowRemoteForm(false);
    } catch (e) {
      setTestError(e as string);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Flyout>
      {!activeConn && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>
              Databases
            </span>
            <FlyoutButton onClick={rescan}>{scanning ? "scanning..." : "rescan"}</FlyoutButton>
          </div>

          {servers.length === 0 && !scanning && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
              No local Postgres, MySQL, or SQLite files detected.
            </div>
          )}

          {PROVIDER_ORDER.map((provider) => {
            const group = servers.filter((s) => s.provider === provider);
            if (group.length === 0) return null;

            return (
              <div key={provider} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: PROVIDER_COLORS[provider] }} />
                  <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: PROVIDER_COLORS[provider], fontWeight: 600 }}>
                    {PROVIDER_LABELS[provider]}
                  </span>
                </div>

                {group.map((s, si) => (
                  <div key={si} style={{ marginBottom: 8 }}>
                    {provider !== "sqlite" && (
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginBottom: 4 }}>
                        {s.host}:{s.port} {s.connected ? `· ${s.user || "auto"}` : ""}
                      </div>
                    )}

                    {!s.connected && s.error && (
                      <div style={{ fontSize: 11, color: "#f87171" }}>{s.error}</div>
                    )}

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {s.databases.map((db) => (
                        <div
                          key={db}
                          onClick={() => openDatabase(s, db)}
                          style={{
                            padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12,
                            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                          }}
                        >
                          {provider === "sqlite" ? db.split("/").pop() : db}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
          <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>Remote</span>
              <FlyoutButton onClick={() => setShowRemoteForm(!showRemoteForm)}>
                {showRemoteForm ? "cancel" : "+ remote"}
              </FlyoutButton>
            </div>

            {showRemoteForm && (
              <RemoteConnectionForm onSave={handleSaveRemote} onCancel={() => setShowRemoteForm(false)} testing={testing} testError={testError} />
            )}

            {remoteConnections.map((c) => (
              <div
                key={c.id}
                onClick={() => {
                  // const conn: DbConnection = {
                  //   id: c.id, name: c.database, provider: c.provider, host: c.host, port: c.port,
                  //   user: c.user, password: c.password, database: c.database, sslMode: c.sslMode ?? "require",
                  // };
                  const conn: DbConnection = {
                     id: c.id, name: c.database, provider: c.provider, host: c.host, port: c.port,
                     user: c.user, password: c.password, database: c.database, sslMode: c.sslMode,
                   };
                  setActiveConn(conn);
                  setActiveDb(c.database);
                  setSql("");
                  loadTables(conn, c.database);
                }}
                // onClick={() => openDatabase(
                //   { provider: c.provider, host: c.host, port: c.port, user: c.user, password: c.password, connected: true, databases: [c.database], error: null },
                //   c.database
                // )}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 10px", borderRadius: 6, cursor: "pointer", marginBottom: 4,
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div>
                  <div style={{ fontSize: 12, color: "#e8e8e8" }}>{c.name}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{c.host}:{c.port} / {c.database}</div>
                </div>
                <span onClick={(e) => { e.stopPropagation(); deleteConnection(c.id); }} style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                  delete
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {activeConn && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 12 }}>
            <span onClick={() => { setActiveConn(null); setActiveDb(null); setTables([]); }} style={{ cursor: "pointer", color: "var(--accent)" }}>
              ← databases
            </span>
            <span style={{ color: "rgba(255,255,255,0.3)" }}>/</span>
            <span style={{ color: PROVIDER_COLORS[activeConn.provider] }}>{activeConn.name}</span>
          </div>

          {loading && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Loading...</div>}
          {error && <div style={{ fontSize: 12, color: "#f87171" }}>{error}</div>}

          {tables.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {tables.map((t) => (
                <div
                  key={t}
                  onClick={() => previewTable(t)}
                  style={{
                    padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11,
                    background: sql.includes(t) ? "var(--accent)22" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${sql.includes(t) ? "var(--accent)" : "rgba(255,255,255,0.1)"}`,
                    color: sql.includes(t) ? "var(--accent)" : "#e8e8e8",
                  }}
                >
                  {t}
                </div>
              ))}
            </div>
          )}

          <textarea
            value={sql} onChange={(e) => setSql(e.target.value)}
            placeholder="SELECT * FROM table_name LIMIT 100"
            style={{ width: "100%", height: 60, resize: "vertical", marginBottom: 6, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#e8e8e8", fontSize: 12, fontFamily: "'JetBrains Mono', monospace", padding: "6px 8px", outline: "none" }}
          />
          <FlyoutButton onClick={() => runQuery(activeConn, activeDb!, sql)} disabled={running || sql.trim() === ""}>
            {running ? "running..." : "run query"}
          </FlyoutButton>

          {queryError && <div style={{ fontSize: 12, color: "#f87171", marginTop: 8 }}>{queryError}</div>}
          {result && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6 }}>
                {result.row_count} row{result.row_count !== 1 && "s"} · {result.duration_ms}ms
              </div>
              <div style={{ overflowX: "auto", maxHeight: 220, overflowY: "auto" }}>
                <table style={{ borderCollapse: "collapse", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", width: "100%" }}>
                  <thead>
                    <tr>
                      {result.columns.map((col) => (
                        <th key={col} style={{ textAlign: "left", padding: "4px 8px", color: "var(--accent)", borderBottom: "1px solid rgba(255,255,255,0.1)", whiteSpace: "nowrap" }}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j} style={{ padding: "4px 8px", color: "#e8e8e8", borderBottom: "1px solid rgba(255,255,255,0.04)", whiteSpace: "nowrap" }}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </Flyout>
  );
}
