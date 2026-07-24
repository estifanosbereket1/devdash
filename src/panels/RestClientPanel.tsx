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

export function RestClientPanel() {
  const { saved, saveRequest, deleteRequest } = useSavedRequests();
  const { response, sending, error, send } = useRequestSender();

  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState("http://localhost:3000");
  const [headers, setHeaders] = useState<HttpHeader[]>([
    { key: "Content-Type", value: "application/json" },
    { key: "", value: "" },
  ]);
  const [body, setBody] = useState("");

  const inputStyle = {
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 6, color: "#e8e8e8", fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
    padding: "6px 8px", outline: "none",
  };

  const updateHeader = (i: number, field: "key" | "value", value: string) => {
    const updated = [...headers];
    updated[i] = { ...updated[i], [field]: value };
    if (i === headers.length - 1 && (updated[i].key || updated[i].value)) {
      updated.push({ key: "", value: "" });
    }
    setHeaders(updated);
  };

  const addHeaderRow = () => setHeaders([...headers, { key: "", value: "" }]);
  const removeHeaderRow = (i: number) => setHeaders(headers.filter((_, idx) => idx !== i));

  const handleSend = () => send(method, url, headers, body);

  const handleSave = () => {
    const name = url.length > 30 ? url.slice(0, 30) + "..." : url;
    saveRequest({ name, method, url, headers: headers.filter((h) => h.key), body });
  };

  const loadSaved = (req: (typeof saved)[number]) => {
    setMethod(req.method);
    setUrl(req.url);
    setHeaders([...req.headers, { key: "", value: "" }]);
    setBody(req.body);
  };

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
        <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." style={{ ...inputStyle, flex: 1 }} />
        <FlyoutButton onClick={handleSend}>{sending ? "sending..." : "send"}</FlyoutButton>
        <FlyoutButton onClick={handleSave}>save</FlyoutButton>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>Headers</span>
        <span onClick={addHeaderRow} style={{ fontSize: 11, color: "var(--accent)", cursor: "pointer" }}>+ header</span>
      </div>
      {headers.map((h, i) => (
        <div key={i} style={{ display: "flex", gap: 6, marginBottom: 4, alignItems: "center" }}>
          <input type="text" placeholder="Key" value={h.key} onChange={(e) => updateHeader(i, "key", e.target.value)} style={{ ...inputStyle, flex: 1 }} />
          <input type="text" placeholder="Value" value={h.value} onChange={(e) => updateHeader(i, "value", e.target.value)} style={{ ...inputStyle, flex: 1 }} />
          {headers.length > 1 && (
            <span onClick={() => removeHeaderRow(i)} style={{ cursor: "pointer", opacity: 0.4, fontSize: 14, padding: "0 4px" }}>×</span>
          )}
        </div>
      ))}

      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", margin: "8px 0 4px" }}>Body</div>
      <textarea
        value={body} onChange={(e) => setBody(e.target.value)} placeholder='{"key": "value"}'
        style={{ ...inputStyle, width: "100%", height: 80, resize: "vertical" }}
      />

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
