use std::time::Duration;
use std::time::Instant;
use sysinfo::System;

#[derive(serde::Serialize)]
pub struct HttpResponseInfo {
    status: u16,
    headers: Vec<(String, String)>,
    body: String,
    duration_ms: u64,
}

#[tauri::command]
pub async fn send_http_request(
    method: String,
    url: String,
    headers: Vec<(String, String)>,
    body: Option<String>,
) -> Result<HttpResponseInfo, String> {
    let client = reqwest::Client::new();
    let method = reqwest::Method::from_bytes(method.as_bytes()).map_err(|e| e.to_string())?;

    let mut request = client.request(method, &url);
    for (key, value) in headers {
        request = request.header(key, value);
    }
    if let Some(b) = body {
        request = request.body(b);
    }

    let start = Instant::now();
    let response = request.send().await.map_err(|e| e.to_string())?;
    let duration_ms = start.elapsed().as_millis() as u64;

    let status = response.status().as_u16();
    let response_headers: Vec<(String, String)> = response
        .headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();
    let body = response.text().await.map_err(|e| e.to_string())?;

    Ok(HttpResponseInfo {
        status,
        headers: response_headers,
        body,
        duration_ms,
    })
}

#[derive(serde::Serialize, Clone)]
pub struct TunnelInfo {
    provider: String,           // "ngrok" | "cloudflared"
    public_url: Option<String>, // Some(url) for ngrok; None for cloudflared (can't be determined)
    local_addr: Option<String>, // ngrok's forwarded target, e.g. "localhost:3000"
    proto: Option<String>,      // ngrok only, e.g. "https"
    status: String,
}

#[derive(serde::Deserialize)]
struct NgrokTunnelsResponse {
    tunnels: Vec<NgrokTunnel>,
}
#[derive(serde::Deserialize)]
struct NgrokTunnel {
    public_url: String,
    proto: String,
    config: NgrokTunnelConfig,
}
#[derive(serde::Deserialize)]
struct NgrokTunnelConfig {
    addr: String,
}

async fn list_ngrok_tunnels() -> Result<Vec<TunnelInfo>, String> {
    let client = reqwest::Client::new();
    let response = client
        .get("http://127.0.0.1:4040/api/tunnels")
        .timeout(Duration::from_millis(500))
        .send()
        .await;

    // connection refused/timeout just means ngrok isn't running — empty result, not an error
    let Ok(response) = response else {
        return Ok(Vec::new());
    };

    let parsed: NgrokTunnelsResponse = response.json().await.map_err(|e| e.to_string())?;
    Ok(parsed
        .tunnels
        .into_iter()
        .map(|t| TunnelInfo {
            provider: "ngrok".to_string(),
            public_url: Some(t.public_url),
            local_addr: Some(t.config.addr),
            proto: Some(t.proto),
            status: "running".to_string(),
        })
        .collect())
}

fn list_cloudflared_tunnels() -> Vec<TunnelInfo> {
    let sys = System::new_all();
    let running = sys
        .processes()
        .values()
        .any(|p| p.name().to_string_lossy().to_lowercase().contains("cloudflared"));

    if running {
        vec![TunnelInfo {
            provider: "cloudflared".to_string(),
            public_url: None,
            local_addr: None,
            proto: None,
            status: "running (public URL not detectable)".to_string(),
        }]
    } else {
        Vec::new()
    }
}

#[tauri::command]
pub async fn list_tunnels() -> Result<Vec<TunnelInfo>, String> {
    let mut result = list_ngrok_tunnels().await?;
    result.extend(list_cloudflared_tunnels());
    Ok(result)
}
