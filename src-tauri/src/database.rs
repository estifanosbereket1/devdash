use sqlx::any::{AnyPoolOptions, AnyRow};
use sqlx::postgres::PgPoolOptions;
use sqlx::{Column, Row, TypeInfo};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

fn build_connection_url(
    provider: &str,
    host: &str,
    port: &str,
    user: &str,
    password: &str,
    database: &str,
    sslmode: &str,
) -> String {
    match provider {
        "postgres" => {
            if sslmode.is_empty() {
                format!("postgres://{user}:{password}@{host}:{port}/{database}")
            } else {
                format!("postgres://{user}:{password}@{host}:{port}/{database}?sslmode={sslmode}")
            }
        }
        "mysql" => format!("mysql://{user}:{password}@{host}:{port}/{database}"),
        "sqlite" => format!("sqlite://{database}"),
        _ => String::new(),
    }
}

fn urlencoding_encode(s: &str) -> String {
    s.replace('/', "%2F")
}

fn build_socket_url(user: &str, socket_dir: &str, database: &str) -> String {
    format!(
        "postgres://{user}@/{database}?host={}",
        urlencoding_encode(socket_dir)
    )
}

async fn connect_pg_socket(
    socket_dir: &str,
    user: &str,
    database: &str,
) -> Result<sqlx::PgPool, sqlx::Error> {
    let opts = sqlx::postgres::PgConnectOptions::new()
        .socket(socket_dir)
        .username(user)
        .database(database);
    sqlx::postgres::PgPoolOptions::new()
        .connect_with(opts)
        .await
}

fn parse_ssl_mode(sslmode: &str) -> sqlx::postgres::PgSslMode {
    match sslmode {
        "require" => sqlx::postgres::PgSslMode::Require,
        "disable" => sqlx::postgres::PgSslMode::Disable,
        "prefer" => sqlx::postgres::PgSslMode::Prefer,
        _ => sqlx::postgres::PgSslMode::Prefer, // sensible default when unspecified
    }
}

async fn connect_pg_tcp(
    host: &str,
    port: &str,
    user: &str,
    password: &str,
    database: &str,
    sslmode: &str,
) -> Result<sqlx::PgPool, sqlx::Error> {
    let opts = sqlx::postgres::PgConnectOptions::new()
        .host(host)
        .port(port.parse().unwrap_or(5432))
        .username(user)
        .password(password)
        .database(database)
        .ssl_mode(parse_ssl_mode(sslmode));
    sqlx::postgres::PgPoolOptions::new()
        .connect_with(opts)
        .await
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn cell_to_string_pg(row: &sqlx::postgres::PgRow, i: usize) -> String {
    use sqlx::ValueRef;

    if row.try_get_raw(i).map(|v| v.is_null()).unwrap_or(false) {
        return String::new();
    }

    let type_name = row.column(i).type_info().name();
    match type_name {
        "UUID" => row
            .try_get::<uuid::Uuid, _>(i)
            .map(|v| v.to_string())
            .unwrap_or_else(|_| "<uuid decode error>".to_string()),
        "TIMESTAMPTZ" => row
            .try_get::<chrono::DateTime<chrono::Utc>, _>(i)
            .map(|v| v.to_rfc3339())
            .unwrap_or_else(|_| "<timestamptz decode error>".to_string()),
        "TIMESTAMP" => row
            .try_get::<chrono::NaiveDateTime, _>(i)
            .map(|v| v.to_string())
            .unwrap_or_else(|_| "<timestamp decode error>".to_string()),
        "DATE" => row
            .try_get::<chrono::NaiveDate, _>(i)
            .map(|v| v.to_string())
            .unwrap_or_else(|_| "<date decode error>".to_string()),
        "TIME" => row
            .try_get::<chrono::NaiveTime, _>(i)
            .map(|v| v.to_string())
            .unwrap_or_else(|_| "<time decode error>".to_string()),
        "NUMERIC" => row
            .try_get::<bigdecimal::BigDecimal, _>(i)
            .map(|v| v.to_string())
            .unwrap_or_else(|_| "<numeric decode error>".to_string()),
        "JSON" | "JSONB" => row
            .try_get::<serde_json::Value, _>(i)
            .map(|v| v.to_string())
            .unwrap_or_else(|_| "<json decode error>".to_string()),
        "BOOL" => row
            .try_get::<bool, _>(i)
            .map(|v| v.to_string())
            .unwrap_or_else(|_| "<bool decode error>".to_string()),
        "INT2" | "INT4" => row
            .try_get::<i32, _>(i)
            .map(|v| v.to_string())
            .unwrap_or_else(|_| "<int decode error>".to_string()),
        "INT8" => row
            .try_get::<i64, _>(i)
            .map(|v| v.to_string())
            .unwrap_or_else(|_| "<int decode error>".to_string()),
        "FLOAT4" | "FLOAT8" => row
            .try_get::<f64, _>(i)
            .map(|v| v.to_string())
            .unwrap_or_else(|_| "<float decode error>".to_string()),
        "BYTEA" => row
            .try_get::<Vec<u8>, _>(i)
            .map(|v| format!("\\x{}", hex_encode(&v)))
            .unwrap_or_else(|_| "<bytea decode error>".to_string()),

        "MONEY" => row
            .try_get::<sqlx::postgres::types::PgMoney, _>(i)
            .map(|v| format!("{:.2}", v.0 as f64 / 100.0))
            .unwrap_or_else(|_| "<money decode error>".to_string()),

        "TEXT[]" | "VARCHAR[]" | "_TEXT" | "_VARCHAR" => row
            .try_get::<Vec<String>, _>(i)
            .map(|v| format!("{{{}}}", v.join(",")))
            .unwrap_or_else(|_| "<text[] decode error>".to_string()),
        "INT4[]" | "_INT4" => row
            .try_get::<Vec<i32>, _>(i)
            .map(|v| {
                format!(
                    "{{{}}}",
                    v.iter()
                        .map(|n| n.to_string())
                        .collect::<Vec<_>>()
                        .join(",")
                )
            })
            .unwrap_or_else(|_| "<int4[] decode error>".to_string()),
        "INT8[]" | "_INT8" => row
            .try_get::<Vec<i64>, _>(i)
            .map(|v| {
                format!(
                    "{{{}}}",
                    v.iter()
                        .map(|n| n.to_string())
                        .collect::<Vec<_>>()
                        .join(",")
                )
            })
            .unwrap_or_else(|_| "<int8[] decode error>".to_string()),
        "UUID[]" | "_UUID" => row
            .try_get::<Vec<uuid::Uuid>, _>(i)
            .map(|v| {
                format!(
                    "{{{}}}",
                    v.iter()
                        .map(|u| u.to_string())
                        .collect::<Vec<_>>()
                        .join(",")
                )
            })
            .unwrap_or_else(|_| "<uuid[] decode error>".to_string()),
        "BOOL[]" | "_BOOL" => row
            .try_get::<Vec<bool>, _>(i)
            .map(|v| {
                format!(
                    "{{{}}}",
                    v.iter()
                        .map(|b| b.to_string())
                        .collect::<Vec<_>>()
                        .join(",")
                )
            })
            .unwrap_or_else(|_| "<bool[] decode error>".to_string()),

        // Custom enum types (like your StaffRole) decode fine as plain text
        _ => row
            .try_get_unchecked::<String, _>(i)
            .unwrap_or_else(|_| format!("<unsupported type: {type_name}>")),
    }
}

// fn cell_to_string_pg(row: &sqlx::postgres::PgRow, i: usize) -> String {
//     use sqlx::ValueRef;

//     // Check genuine NULL before attempting any decode — this is what was
//     // missing before, and is why real nulls and undecodable types looked identical.
//     if row.try_get_raw(i).map(|v| v.is_null()).unwrap_or(false) {
//         return String::new();
//     }

//     let type_name = row.column(i).type_info().name();
//     match type_name {
//         "UUID" => row
//             .try_get::<uuid::Uuid, _>(i)
//             .map(|v| v.to_string())
//             .unwrap_or_else(|_| format!("<uuid decode error>")),
//         "TIMESTAMPTZ" => row
//             .try_get::<chrono::DateTime<chrono::Utc>, _>(i)
//             .map(|v| v.to_rfc3339())
//             .unwrap_or_else(|_| format!("<timestamptz decode error>")),
//         "TIMESTAMP" => row
//             .try_get::<chrono::NaiveDateTime, _>(i)
//             .map(|v| v.to_string())
//             .unwrap_or_else(|_| format!("<timestamp decode error>")),
//         "DATE" => row
//             .try_get::<chrono::NaiveDate, _>(i)
//             .map(|v| v.to_string())
//             .unwrap_or_else(|_| format!("<date decode error>")),
//         "TIME" => row
//             .try_get::<chrono::NaiveTime, _>(i)
//             .map(|v| v.to_string())
//             .unwrap_or_else(|_| format!("<time decode error>")),
//         "NUMERIC" => row
//             .try_get::<bigdecimal::BigDecimal, _>(i)
//             .map(|v| v.to_string())
//             .unwrap_or_else(|_| format!("<numeric decode error>")),
//         "JSON" | "JSONB" => row
//             .try_get::<serde_json::Value, _>(i)
//             .map(|v| v.to_string())
//             .unwrap_or_else(|_| format!("<json decode error>")),
//         "BOOL" => row
//             .try_get::<bool, _>(i)
//             .map(|v| v.to_string())
//             .unwrap_or_else(|_| format!("<bool decode error>")),
//         "INT2" | "INT4" => row
//             .try_get::<i32, _>(i)
//             .map(|v| v.to_string())
//             .unwrap_or_else(|_| format!("<int decode error>")),
//         "INT8" => row
//             .try_get::<i64, _>(i)
//             .map(|v| v.to_string())
//             .unwrap_or_else(|_| format!("<int decode error>")),
//         "FLOAT4" | "FLOAT8" => row
//             .try_get::<f64, _>(i)
//             .map(|v| v.to_string())
//             .unwrap_or_else(|_| format!("<float decode error>")),
//         _ => row
//             .try_get::<String, _>(i)
//             .unwrap_or_else(|_| format!("<unsupported type: {type_name}>")),
//     }
// }

#[tauri::command]
pub async fn test_db_connection(
    provider: String,
    host: String,
    port: String,
    user: String,
    password: String,
    database: String,
    sslmode: String,
) -> Result<(), String> {
    sqlx::any::install_default_drivers();
    let url = build_connection_url(
        &provider, &host, &port, &user, &password, &database, &sslmode,
    );
    let pool = AnyPoolOptions::new()
        .connect(&url)
        .await
        .map_err(|e| e.to_string())?;
    pool.close().await;
    Ok(())
}

#[tauri::command]
pub async fn list_databases(
    provider: String,
    host: String,
    port: String,
    user: String,
    password: String,
    sslmode: String,
) -> Result<Vec<String>, String> {
    sqlx::any::install_default_drivers();
    // connect to a default/admin database first, since we need *a* database to connect to before listing others
    let admin_db =
        match provider.as_str() {
            "postgres" => "postgres",
            "mysql" => "mysql",
            _ => return Err(
                "SQLite has no concept of multiple databases — point it directly at a file instead"
                    .into(),
            ),
        };
    let url = build_connection_url(
        &provider, &host, &port, &user, &password, admin_db,
        &sslmode, // ⬅️ use admin_db here, not &database — this fn never took a database param, it connects to the admin db to list others
    );
    let pool = AnyPoolOptions::new()
        .connect(&url)
        .await
        .map_err(|e| e.to_string())?;

    let query = match provider.as_str() {
        "postgres" => "SELECT datname::text FROM pg_database WHERE datistemplate = false",
        "mysql" => "SHOW DATABASES",
        _ => unreachable!(),
    };

    let rows = sqlx::query(query)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;
    pool.close().await;

    Ok(rows
        .iter()
        .filter_map(|r| r.try_get::<String, _>(0).ok())
        .collect())
}

#[tauri::command]
pub async fn list_tables(
    provider: String,
    host: String,
    port: String,
    user: String,
    password: String,
    database: String,
    sslmode: String,
) -> Result<Vec<String>, String> {
    sqlx::any::install_default_drivers();

    if provider == "postgres" && host.starts_with("socket:") {
        let socket_dir = host.trim_start_matches("socket:");
        let pool = connect_pg_socket(socket_dir, &user, &database)
            .await
            .map_err(|e| e.to_string())?;
        let rows = sqlx::query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
        )
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;
        pool.close().await;
        return Ok(rows
            .iter()
            .filter_map(|r| r.try_get::<String, _>(0).ok())
            .collect());
    }

    let url = build_connection_url(
        &provider, &host, &port, &user, &password, &database, &sslmode,
    );
    let pool = AnyPoolOptions::new()
        .connect(&url)
        .await
        .map_err(|e| e.to_string())?;

    let query = match provider.as_str() {
        "postgres" => {
            "SELECT table_name::text FROM information_schema.tables WHERE table_schema = 'public'"
        }
        "mysql" => "SHOW TABLES",
        "sqlite" => {
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
        }
        _ => return Err("Unknown provider".into()),
    };

    let rows = sqlx::query(query)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;
    pool.close().await;

    Ok(rows
        .iter()
        .filter_map(|r| r.try_get::<String, _>(0).ok())
        .collect())
}

fn cell_to_string(row: &AnyRow, i: usize) -> String {
    use sqlx::ValueRef;

    if row.try_get_raw(i).map(|v| v.is_null()).unwrap_or(false) {
        return String::new();
    }

    if let Ok(v) = row.try_get::<String, _>(i) {
        return v;
    }
    if let Ok(v) = row.try_get::<i64, _>(i) {
        return v.to_string();
    }
    if let Ok(v) = row.try_get::<i32, _>(i) {
        return v.to_string();
    }
    if let Ok(v) = row.try_get::<f64, _>(i) {
        return v.to_string();
    }
    if let Ok(v) = row.try_get::<bool, _>(i) {
        return v.to_string();
    }

    format!("<unsupported type: {}>", row.column(i).type_info().name())
}

#[derive(serde::Serialize)]
pub struct QueryResult {
    columns: Vec<String>,
    rows: Vec<Vec<String>>,
    row_count: usize,
    duration_ms: u64,
}

#[tauri::command]
pub async fn run_query(
    provider: String,
    host: String,
    port: String,
    user: String,
    password: String,
    database: String,
    sql: String,
    sslmode: String,
) -> Result<QueryResult, String> {
    sqlx::any::install_default_drivers();

    if provider == "postgres" && host.starts_with("socket:") {
        let socket_dir = host.trim_start_matches("socket:");
        let pool = connect_pg_socket(socket_dir, &user, &database)
            .await
            .map_err(|e| e.to_string())?;

        let start = std::time::Instant::now();
        let rows = sqlx::query(&sql)
            .fetch_all(&pool)
            .await
            .map_err(|e| e.to_string())?;
        let duration_ms = start.elapsed().as_millis() as u64;
        pool.close().await;

        let columns = rows
            .first()
            .map(|r| r.columns().iter().map(|c| c.name().to_string()).collect())
            .unwrap_or_default();
        let result_rows: Vec<Vec<String>> = rows
            .iter()
            .map(|row| {
                (0..row.columns().len())
                    .map(|i| cell_to_string_pg(row, i))
                    .collect()
            })
            .collect();
        let row_count = result_rows.len();

        return Ok(QueryResult {
            columns,
            rows: result_rows,
            row_count,
            duration_ms,
        });
    }

    if provider == "postgres" {
        let pool = connect_pg_tcp(&host, &port, &user, &password, &database, &sslmode)
            .await
            .map_err(|e| e.to_string())?;

        let start = std::time::Instant::now();
        let rows = sqlx::query(&sql)
            .fetch_all(&pool)
            .await
            .map_err(|e| e.to_string())?;
        let duration_ms = start.elapsed().as_millis() as u64;
        pool.close().await;

        let columns = rows
            .first()
            .map(|r| r.columns().iter().map(|c| c.name().to_string()).collect())
            .unwrap_or_default();
        let result_rows: Vec<Vec<String>> = rows
            .iter()
            .map(|row| {
                (0..row.columns().len())
                    .map(|i| cell_to_string_pg(row, i))
                    .collect()
            })
            .collect();
        let row_count = result_rows.len();

        return Ok(QueryResult {
            columns,
            rows: result_rows,
            row_count,
            duration_ms,
        });
    }
    let url = build_connection_url(
        &provider, &host, &port, &user, &password, &database, &sslmode,
    );
    let pool = AnyPoolOptions::new()
        .connect(&url)
        .await
        .map_err(|e| e.to_string())?;

    let start = std::time::Instant::now();
    let rows = sqlx::query(&sql)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;
    let duration_ms = start.elapsed().as_millis() as u64;
    pool.close().await;

    let columns = rows
        .first()
        .map(|r| r.columns().iter().map(|c| c.name().to_string()).collect())
        .unwrap_or_default();

    let result_rows: Vec<Vec<String>> = rows
        .iter()
        .map(|row| {
            (0..row.columns().len())
                .map(|i| cell_to_string(row, i))
                .collect()
        })
        .collect();

    let row_count = result_rows.len();
    Ok(QueryResult {
        columns,
        rows: result_rows,
        row_count,
        duration_ms,
    })
}

#[derive(serde::Serialize, Clone)]
pub struct DiscoveredServer {
    provider: String,
    host: String,
    port: String,
    user: String,
    password: String,
    connected: bool,
    databases: Vec<String>,
    error: Option<String>,
}

fn port_open(host: &str, port: u16) -> bool {
    let addr = format!("{host}:{port}");
    match addr.to_socket_addrs() {
        Ok(mut addrs) => addrs
            .next()
            .map(|a| TcpStream::connect_timeout(&a, Duration::from_millis(300)).is_ok())
            .unwrap_or(false),
        Err(_) => false,
    }
}

fn os_user() -> Option<String> {
    std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .ok()
}

fn pg_candidates() -> Vec<(String, String)> {
    let mut v = vec![];
    if let Some(u) = os_user() {
        v.push((u, String::new()));
    } // local peer/trust auth
    v.push(("postgres".into(), String::new()));
    v.push(("postgres".into(), "postgres".into()));
    v
}

fn mysql_candidates() -> Vec<(String, String)> {
    vec![
        ("root".into(), String::new()),
        ("root".into(), "root".into()),
    ]
}

fn walk_for_sqlite(root: &str, found: &mut Vec<String>, depth: u8) {
    if depth > 4 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if matches!(name, "node_modules" | ".git" | "target" | "dist" | "build") {
                continue;
            }
            walk_for_sqlite(path.to_str().unwrap_or(""), found, depth + 1);
        } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            if matches!(ext, "db" | "sqlite" | "sqlite3") {
                found.push(path.to_string_lossy().to_string());
            }
        }
    }
}

#[tauri::command]
pub async fn discover_databases(sqlite_roots: Vec<String>) -> Vec<DiscoveredServer> {
    sqlx::any::install_default_drivers();
    let mut results = Vec::new();

    let mut socket_connected = false;
    if let Some(user) = os_user() {
        for socket_dir in ["/var/run/postgresql", "/tmp"] {
            eprintln!("[db-discover] trying socket: {socket_dir} as user {user}");

            let opts = sqlx::postgres::PgConnectOptions::new()
                .socket(socket_dir)
                .username(&user)
                .database("postgres");

            match PgPoolOptions::new().connect_with(opts).await {
                Ok(pool) => {
                    match sqlx::query("SELECT datname FROM pg_database WHERE datistemplate = false")
                        .fetch_all(&pool)
                        .await
                    {
                        Ok(rows) => {
                            results.push(DiscoveredServer {
                                provider: "postgres".into(),
                                host: format!("socket:{socket_dir}"),
                                port: String::new(),
                                user: user.clone(),
                                password: String::new(),
                                connected: true,
                                databases: rows
                                    .iter()
                                    .filter_map(|r| r.try_get::<String, _>(0).ok())
                                    .collect(),
                                error: None,
                            });
                            socket_connected = true;
                        }
                        Err(e) => eprintln!("[db-discover] query failed: {e}"),
                    }
                    pool.close().await;
                    if socket_connected {
                        break;
                    }
                }
                Err(e) => eprintln!("[db-discover] connect failed: {e}"),
            }
        }
    }

    for port in [5432u16, 5433] {
        if socket_connected {
            break;
        }
        if !port_open("localhost", port) {
            continue;
        }
        let mut server = DiscoveredServer {
            provider: "postgres".into(),
            host: "localhost".into(),
            port: port.to_string(),
            user: String::new(),
            password: String::new(),
            connected: false,
            databases: vec![],
            error: None,
        };
        for (user, pass) in pg_candidates() {
            let url = build_connection_url(
                "postgres",
                "localhost",
                &port.to_string(),
                &user,
                &pass,
                "postgres",
                "", // ⬅️ ADD THIS — local discovery, no SSL needed
            );
            if let Ok(pool) = AnyPoolOptions::new().connect(&url).await {
                if let Ok(rows) =
                    sqlx::query("SELECT datname FROM pg_database WHERE datistemplate = false")
                        .fetch_all(&pool)
                        .await
                {
                    server.databases = rows
                        .iter()
                        .filter_map(|r| r.try_get::<String, _>(0).ok())
                        .collect();
                    server.connected = true;
                    server.user = user;
                    server.password = pass;
                }
                pool.close().await;
                if server.connected {
                    break;
                }
            }
        }
        if !server.connected {
            server.error = Some("Found a Postgres server but couldn't auto-authenticate".into());
        }
        results.push(server);
    }

    for port in [3306u16, 3307] {
        if !port_open("localhost", port) {
            continue;
        }
        let mut server = DiscoveredServer {
            provider: "mysql".into(),
            host: "localhost".into(),
            port: port.to_string(),
            user: String::new(),
            password: String::new(),
            connected: false,
            databases: vec![],
            error: None,
        };
        for (user, pass) in mysql_candidates() {
            let url = build_connection_url(
                "mysql",
                "localhost",
                &port.to_string(),
                &user,
                &pass,
                "mysql",
                "", // ⬅️ ADD THIS — local discovery, no SSL needed
            );
            if let Ok(pool) = AnyPoolOptions::new().connect(&url).await {
                if let Ok(rows) = sqlx::query("SHOW DATABASES").fetch_all(&pool).await {
                    server.databases = rows
                        .iter()
                        .filter_map(|r| r.try_get::<String, _>(0).ok())
                        .collect();
                    server.connected = true;
                    server.user = user;
                    server.password = pass;
                }
                pool.close().await;
                if server.connected {
                    break;
                }
            }
        }
        if !server.connected {
            server.error = Some("Found a MySQL server but couldn't auto-authenticate".into());
        }
        results.push(server);
    }

    for root in sqlite_roots {
        let mut found = Vec::new();
        walk_for_sqlite(&root, &mut found, 0);
        for path in found {
            results.push(DiscoveredServer {
                provider: "sqlite".into(),
                host: String::new(),
                port: String::new(),
                user: String::new(),
                password: String::new(),
                connected: true,
                databases: vec![path],
                error: None,
            });
        }
    }

    results
}
