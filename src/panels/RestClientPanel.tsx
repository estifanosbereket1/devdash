import { useState } from "react";
import { Flyout, FlyoutButton } from "../Flyout";
import { useSavedRequests, useRequestSender } from "../hooks/useRestClient";
import type { HttpHeader } from "../types";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const METHOD_COLORS: Record<string, string> = {
  GET: "#5eead4",
  POST: "var(--accent)",
  PUT: "#a78bfa",
  PATCH: "#a78bfa",
  DELETE: "#f87171",
};

type AuthType = "none" | "bearer" | "basic" | "apikey";
type ApiKeyLocation = "header" | "query";

interface AuthConfig {
  type: AuthType;
  bearerToken: string;
  basicUser: string;
  basicPass: string;
  apiKeyName: string;
  apiKeyValue: string;
  apiKeyLocation: ApiKeyLocation;
}

const DEFAULT_AUTH: AuthConfig = {
  type: "none",
  bearerToken: "",
  basicUser: "",
  basicPass: "",
  apiKeyName: "",
  apiKeyValue: "",
  apiKeyLocation: "header",
};

function statusColor(status: number): string {
  if (status >= 200 && status < 300) return "#5eead4";
  if (status >= 300 && status < 400) return "var(--accent)";
  return "#f87171";
}

function tryPrettyPrint(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

function parseQueryString(qs: string): HttpHeader[] {
  if (!qs) return [];
  return qs.split("&").filter(Boolean).map((pair) => {
    const [k, v = ""] = pair.split("=");
    return { key: decodeURIComponent(k || ""), value: decodeURIComponent(v) };
  });
}

function buildUrl(base: string, params: HttpHeader[]): string {
  const filtered = params.filter((p) => p.key);
  if (filtered.length === 0) return base;
  const qs = filtered
    .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
    .join("&");
  return `${base}?${qs}`;
}

function splitUrl(raw: string): { base: string; params: HttpHeader[] } {
  const idx = raw.indexOf("?");
  if (idx === -1) return { base: raw, params: [{ key: "", value: "" }] };
  const parsed = parseQueryString(raw.slice(idx + 1));
  return { base: raw.slice(0, idx), params: [...parsed, { key: "", value: "" }] };
}

function MethodPicker({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          width: 90, padding: "6px 8px", borderRadius: 6, cursor: "pointer",
          background: "rgba(255,255,255,0.05)", border: `1px solid ${METHOD_COLORS[value]}55`,
          color: METHOD_COLORS[value], fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 600, textAlign: "center",
        }}
      >
        {value}
      </div>
      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 10,
          background: "#14161c", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6,
          overflow: "hidden", width: 90,
        }}>
          {METHODS.map((m) => (
            <div
              key={m}
              onClick={() => { onChange(m); setOpen(false); }}
              style={{
                padding: "6px 8px", cursor: "pointer", fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 600, color: METHOD_COLORS[m], background: m === value ? "rgba(255,255,255,0.06)" : "transparent",
              }}
            >
              {m}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AuthTypePicker({ value, onChange }: { value: AuthType; onChange: (t: AuthType) => void }) {
  const [open, setOpen] = useState(false);
  const labels: Record<AuthType, string> = {
    none: "No Auth", bearer: "Bearer Token", basic: "Basic Auth", apikey: "API Key",
  };

  return (
    <div style={{ position: "relative" }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          padding: "6px 10px", borderRadius: 6, cursor: "pointer", width: 140,
          background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
          color: "#e8e8e8", fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        {labels[value]}
      </div>
      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 10,
          background: "#14161c", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6,
          overflow: "hidden", width: 140,
        }}>
          {(Object.keys(labels) as AuthType[]).map((t) => (
            <div
              key={t}
              onClick={() => { onChange(t); setOpen(false); }}
              style={{
                padding: "6px 10px", cursor: "pointer", fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                color: "#e8e8e8", background: t === value ? "rgba(255,255,255,0.06)" : "transparent",
              }}
            >
              {labels[t]}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function RestClientPanel() {
  const { saved, saveRequest, deleteRequest } = useSavedRequests();
  const { response, sending, error, send } = useRequestSender();

  const [method, setMethod] = useState("GET");
  const [baseUrl, setBaseUrl] = useState("http://localhost:3000");
  const [queryParams, setQueryParams] = useState<HttpHeader[]>([{ key: "", value: "" }]);
  const [headers, setHeaders] = useState<HttpHeader[]>([
    { key: "Content-Type", value: "application/json" },
    { key: "", value: "" },
  ]);
  const [body, setBody] = useState("");
  const [auth, setAuth] = useState<AuthConfig>(DEFAULT_AUTH);
  const [tab, setTab] = useState<"params" | "auth" | "headers" | "body">("params");

  const inputStyle = {
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 6, color: "#e8e8e8", fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
    padding: "6px 8px", outline: "none",
  };

  const displayUrl = buildUrl(baseUrl, queryParams);

  const onUrlChange = (raw: string) => {
    const { base, params } = splitUrl(raw);
    setBaseUrl(base);
    setQueryParams(params);
  };

  const updateRow = (
    list: HttpHeader[], setList: (h: HttpHeader[]) => void, i: number, field: "key" | "value", value: string
  ) => {
    const updated = [...list];
    updated[i] = { ...updated[i], [field]: value };
    if (i === list.length - 1 && (updated[i].key || updated[i].value)) {
      updated.push({ key: "", value: "" });
    }
    setList(updated);
  };

  const removeRow = (list: HttpHeader[], setList: (h: HttpHeader[]) => void, i: number) =>
    setList(list.filter((_, idx) => idx !== i));

  // Resolve auth into the actual headers/params sent on the wire, without
  // polluting the visible Headers/Params rows.
  const authHeaders: HttpHeader[] = [];
  const authParams: HttpHeader[] = [];
  if (auth.type === "bearer" && auth.bearerToken) {
    authHeaders.push({ key: "Authorization", value: `Bearer ${auth.bearerToken}` });
  } else if (auth.type === "basic" && (auth.basicUser || auth.basicPass)) {
    const encoded = btoa(`${auth.basicUser}:${auth.basicPass}`);
    authHeaders.push({ key: "Authorization", value: `Basic ${encoded}` });
  } else if (auth.type === "apikey" && auth.apiKeyName) {
    if (auth.apiKeyLocation === "header") {
      authHeaders.push({ key: auth.apiKeyName, value: auth.apiKeyValue });
    } else {
      authParams.push({ key: auth.apiKeyName, value: auth.apiKeyValue });
    }
  }

  const effectiveHeaders = [...headers.filter((h) => h.key), ...authHeaders];
  const effectiveParams = [...queryParams.filter((p) => p.key), ...authParams];
  const finalUrl = buildUrl(baseUrl, effectiveParams);

  const handleSend = () => send(method, finalUrl, effectiveHeaders, body);

  const handleSave = () => {
    const name = finalUrl.length > 30 ? finalUrl.slice(0, 30) + "..." : finalUrl;
    // NOTE: auth is intentionally not persisted here yet — see note below the code.
    saveRequest({ name, method, url: finalUrl, headers: headers.filter((h) => h.key), body });
  };

  const loadSaved = (req: (typeof saved)[number]) => {
    setMethod(req.method);
    const { base, params } = splitUrl(req.url);
    setBaseUrl(base);
    setQueryParams(params);
    setHeaders([...req.headers, { key: "", value: "" }]);
    setBody(req.body);
  };

  const tabBtnStyle = (active: boolean) => ({
    fontSize: 11, cursor: "pointer", padding: "4px 2px", marginRight: 16,
    color: active ? "var(--accent)" : "rgba(255,255,255,0.4)",
    borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
    textTransform: "uppercase" as const,
  });

  return (
    <Flyout>
      {saved.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {saved.map((r) => (
            <div key={r.id} style={{
              display: "flex", alignItems: "center", gap: 4,
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 6, padding: "3px 8px", fontSize: 11, color: "rgba(255,255,255,0.7)",
            }}>
              <span onClick={() => loadSaved(r)} style={{ cursor: "pointer" }}>{r.method} {r.name}</span>
              <span onClick={() => deleteRequest(r.id)} style={{ cursor: "pointer", opacity: 0.5, marginLeft: 4 }}>×</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <MethodPicker value={method} onChange={setMethod} />
        <input
          type="text" value={displayUrl} onChange={(e) => onUrlChange(e.target.value)}
          placeholder="https://..." style={{ ...inputStyle, flex: 1 }}
        />
        <FlyoutButton onClick={handleSend}>{sending ? "sending..." : "send"}</FlyoutButton>
        <FlyoutButton onClick={handleSave}>save</FlyoutButton>
      </div>

      <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 10 }}>
        <span style={tabBtnStyle(tab === "params")} onClick={() => setTab("params")}>
          Params{effectiveParams.length ? ` (${effectiveParams.length})` : ""}
        </span>
        <span style={tabBtnStyle(tab === "auth")} onClick={() => setTab("auth")}>
          Auth{auth.type !== "none" ? " •" : ""}
        </span>
        <span style={tabBtnStyle(tab === "headers")} onClick={() => setTab("headers")}>
          Headers{headers.filter((h) => h.key).length ? ` (${headers.filter((h) => h.key).length})` : ""}
        </span>
        <span style={tabBtnStyle(tab === "body")} onClick={() => setTab("body")}>Body</span>
      </div>

      {tab === "params" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
            <span onClick={() => setQueryParams([...queryParams, { key: "", value: "" }])} style={{ fontSize: 11, color: "var(--accent)", cursor: "pointer" }}>
              + param
            </span>
          </div>
          {queryParams.map((p, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 4, alignItems: "center" }}>
              <input
                type="text" placeholder="Key" value={p.key}
                onChange={(e) => updateRow(queryParams, setQueryParams, i, "key", e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              <input
                type="text" placeholder="Value" value={p.value}
                onChange={(e) => updateRow(queryParams, setQueryParams, i, "value", e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              {queryParams.length > 1 && (
                <span onClick={() => removeRow(queryParams, setQueryParams, i)} style={{ cursor: "pointer", opacity: 0.4, fontSize: 14, padding: "0 4px" }}>×</span>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "auth" && (
        <div>
          <div style={{ marginBottom: 10 }}>
            <AuthTypePicker value={auth.type} onChange={(type) => setAuth({ ...auth, type })} />
          </div>

          {auth.type === "bearer" && (
            <input
              type="text" placeholder="Token" value={auth.bearerToken}
              onChange={(e) => setAuth({ ...auth, bearerToken: e.target.value })}
              style={{ ...inputStyle, width: "100%" }}
            />
          )}

          {auth.type === "basic" && (
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="text" placeholder="Username" value={auth.basicUser}
                onChange={(e) => setAuth({ ...auth, basicUser: e.target.value })}
                style={{ ...inputStyle, flex: 1 }}
              />
              <input
                type="password" placeholder="Password" value={auth.basicPass}
                onChange={(e) => setAuth({ ...auth, basicPass: e.target.value })}
                style={{ ...inputStyle, flex: 1 }}
              />
            </div>
          )}

          {auth.type === "apikey" && (
            <div>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                <input
                  type="text" placeholder="Key" value={auth.apiKeyName}
                  onChange={(e) => setAuth({ ...auth, apiKeyName: e.target.value })}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <input
                  type="text" placeholder="Value" value={auth.apiKeyValue}
                  onChange={(e) => setAuth({ ...auth, apiKeyValue: e.target.value })}
                  style={{ ...inputStyle, flex: 1 }}
                />
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {(["header", "query"] as ApiKeyLocation[]).map((loc) => (
                  <span
                    key={loc}
                    onClick={() => setAuth({ ...auth, apiKeyLocation: loc })}
                    style={{
                      fontSize: 11, padding: "4px 10px", borderRadius: 6, cursor: "pointer",
                      background: auth.apiKeyLocation === loc ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${auth.apiKeyLocation === loc ? "var(--accent)" : "rgba(255,255,255,0.1)"}`,
                      color: auth.apiKeyLocation === loc ? "var(--accent)" : "rgba(255,255,255,0.5)",
                      textTransform: "capitalize",
                    }}
                  >
                    {loc}
                  </span>
                ))}
              </div>
            </div>
          )}

          {auth.type === "none" && (
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>This request does not use any authorization.</p>
          )}
        </div>
      )}

      {tab === "headers" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
            <span onClick={() => setHeaders([...headers, { key: "", value: "" }])} style={{ fontSize: 11, color: "var(--accent)", cursor: "pointer" }}>
              + header
            </span>
          </div>
          {headers.map((h, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 4, alignItems: "center" }}>
              <input
                type="text" placeholder="Key" value={h.key}
                onChange={(e) => updateRow(headers, setHeaders, i, "key", e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              <input
                type="text" placeholder="Value" value={h.value}
                onChange={(e) => updateRow(headers, setHeaders, i, "value", e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              {headers.length > 1 && (
                <span onClick={() => removeRow(headers, setHeaders, i)} style={{ cursor: "pointer", opacity: 0.4, fontSize: 14, padding: "0 4px" }}>×</span>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "body" && (
        <textarea
          value={body} onChange={(e) => setBody(e.target.value)} placeholder='{"key": "value"}'
          style={{ ...inputStyle, width: "100%", height: 120, resize: "vertical" }}
        />
      )}

      {error && <p style={{ color: "#f87171", fontSize: 12, marginTop: 10 }}>{error}</p>}

      {response && (
        <div style={{ marginTop: 12, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
            <span style={{ color: statusColor(response.status), fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}>
              {response.status}
            </span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{response.duration_ms}ms</span>
          </div>
          <pre style={{
            fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: "#e8e8e8",
            background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: 10,
            maxHeight: 160, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word",
          }}>
            {tryPrettyPrint(response.body)}
          </pre>
        </div>
      )}
    </Flyout>
  );
}
