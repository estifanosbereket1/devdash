import { useState } from "react";
import { useDiscoveredServers, useDbBrowser, useQueryRunner } from "../hooks/useDatabase";
import type { DiscoveredServer, DbConnection, DbProvider } from "../types";
import { Flyout, FlyoutButton } from "../Flyout";

const PROVIDER_COLORS: Record<DbProvider, string> = {
  postgres: "#5eead4", mysql: "#ff9f5b", sqlite: "#a78bfa",
};
const PROVIDER_LABELS: Record<DbProvider, string> = {
  postgres: "PostgreSQL", mysql: "MySQL", sqlite: "SQLite",
};
const PROVIDER_ORDER: DbProvider[] = ["postgres", "mysql", "sqlite"];

export function DatabasePanel({ sqliteRoots = [] }: { sqliteRoots?: string[] }) {
  const { servers, scanning, rescan } = useDiscoveredServers(sqliteRoots);
  const { tables, loading, error, loadTables, setTables } = useDbBrowser();
  const { result, running, error: queryError, runQuery } = useQueryRunner();

  const [activeConn, setActiveConn] = useState<DbConnection | null>(null);
  const [activeDb, setActiveDb] = useState<string | null>(null);
  const [sql, setSql] = useState("");

  const asConnection = (s: DiscoveredServer, database: string): DbConnection => ({
    id: `${s.provider}:${s.host}:${s.port}:${database}`,
    name: database, provider: s.provider, host: s.host, port: s.port,
    user: s.user, password: s.password, database,
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
