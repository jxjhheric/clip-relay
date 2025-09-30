use std::{env, net::SocketAddr, time::Duration};

use axum::{
    extract::{Request, State, Path, Multipart},
    extract::DefaultBodyLimit,
    http::{HeaderMap, HeaderValue, Method, StatusCode, Uri},
    middleware::from_fn_with_state,
    response::{IntoResponse, Response},
    response::sse::{Event, KeepAlive, Sse},
    routing::{get, post},
    Json, Router,
};
use futures_util::{stream, Stream, StreamExt};
use std::convert::Infallible;
use serde::{Deserialize, Serialize};
use tokio::{sync::broadcast, time as tokio_time, net::TcpListener};
use tokio_util::io::ReaderStream;
use tokio::io::AsyncWriteExt;
use axum::body::Body;
use tower_http::{cors::{Any, CorsLayer}, trace::TraceLayer, services::{ServeDir, ServeFile}, compression::CompressionLayer};
use axum::routing::get_service;
use axum::http::header::{ACCEPT, CONTENT_TYPE, AUTHORIZATION};
use std::sync::{Arc, Mutex};
use rusqlite::{Connection, params};
use time::OffsetDateTime;
use uuid::Uuid;
use std::fs as stdfs;
use std::path::{Path as StdPath, PathBuf};
// use mime_guess::from_path as guess_mime;
use sha2::{Digest, Sha256};
use rand::RngCore;
use base64::engine::general_purpose::URL_SAFE_NO_PAD as B64_URL_SAFE_NO_PAD;
use base64::Engine as _;

#[derive(Clone)]
struct AppState {
    tx: broadcast::Sender<ServerEvent>,
    password: Option<String>,
    db: Arc<Mutex<Connection>>,
    data_dir: PathBuf,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct ServerEvent {
    #[serde(rename = "event")]
    name: String,
    data: serde_json::Value,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    init_tracing();
    // Load environment from .env in current or parent directory (best-effort)
    let _ = dotenvy::dotenv();
    if env::var("CLIPBOARD_PASSWORD").is_err() {
        let _ = dotenvy::from_filename("../.env");
    }

    let (tx, _rx) = broadcast::channel::<ServerEvent>(1024);
    let password = env::var("CLIPBOARD_PASSWORD").ok();
    let data_dir = ensure_data_dirs()?;
    let db = init_db(&data_dir)?;
    let state = AppState { tx, password, db: Arc::new(Mutex::new(db)), data_dir };

    let protected = Router::new()
        .route("/events", get(sse_events))
        .route("/dev/broadcast", post(dev_broadcast))
        .route("/health", get(health))
        // Clipboard core
        .route("/clipboard", get(list_clipboard).post(create_clipboard))
        .route("/clipboard/:id", get(get_clipboard).delete(delete_clipboard))
        .route("/clipboard/reorder", post(reorder_clipboard))
        // Files
        .route("/files/:id", get(get_file))
        // Allow large multipart bodies (up to 210MB)
        .layer(DefaultBodyLimit::max(210 * 1024 * 1024))
        .layer(from_fn_with_state(state.clone(), auth_mw));

    let public = Router::new()
        .route("/auth/verify", post(auth_verify))
        .route("/auth/logout", post(auth_logout))
        .route("/healthz", get(health));

    let api = Router::new().nest("/api", protected.merge(public));

    // Static front-end serving (tries STATIC_DIR, then ./out, ./.next-export, ../out, ../.next-export)
    let static_root = if let Ok(s) = env::var("STATIC_DIR") { PathBuf::from(s) } else {
        let cwd = env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        let c1 = cwd.join("out");
        if c1.exists() { c1 } else {
            let c2 = cwd.join(".next-export");
            if c2.exists() { c2 } else {
                let p1 = cwd.join("..").join("out");
                if p1.exists() { p1 } else { cwd.join("..").join(".next-export") }
            }
        }
    };
    let spa_index = ServeFile::new(static_root.join("index.html"));
    let serve_dir = ServeDir::new(static_root.clone()).not_found_service(spa_index.clone());
    // Share entry: prefer s/index.html, fallback to s.html (Next export may choose either)
    let share_entry_path = {
        let p1 = static_root.join("s").join("index.html");
        if p1.exists() { p1 } else { static_root.join("s.html") }
    };
    let share_index = ServeFile::new(share_entry_path);

    let app = Router::new()
        .merge(api)
        // Public share endpoints (no global auth) - use closures to avoid Handler type inference pitfalls
        .route("/api/share/:token", get(share_meta))
        .route("/api/share/:token/verify", post(share_verify))
        .route(
            "/api/share/:token/file",
            get(|State(state): State<AppState>, Path(token): Path<String>, headers: HeaderMap| async move {
                share_file_inner(state, token, headers).await
            }),
        )
        .route(
            "/api/share/:token/download",
            get(|State(state): State<AppState>, Path(token): Path<String>, headers: HeaderMap| async move {
                share_download_inner(state, token, headers).await
            }),
        )
        // Protected share management
        .merge(
            Router::new()
                .route("/api/share", get(share_list).post(share_create))
                .route("/api/share/:token", axum::routing::delete(share_delete))
                .route("/api/share/:token/revoke", post(share_revoke))
                .layer(from_fn_with_state(state.clone(), auth_mw))
        )
        .route("/s", get_service(share_index.clone()))
        .route("/s/", get_service(share_index.clone()))
        .nest_service("/", serve_dir)
        .with_state(state)
        .layer(CompressionLayer::new())
        .layer(TraceLayer::new_for_http())
        .layer(build_cors());

    let port: u16 = env::var("PORT").ok().and_then(|s| s.parse().ok()).unwrap_or(8087);
    let addr: SocketAddr = ([0, 0, 0, 0], port).into();
    let listener = TcpListener::bind(addr).await?;
    tracing::info!(%addr, "Rust API listening");
    axum::serve(listener, app).await?;
    Ok(())
}

fn init_tracing() {
    let filter = env::var("RUST_LOG").unwrap_or_else(|_| "info,tower_http=off,hyper=off".to_string());
    let _ = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(false)
        .try_init();
}

fn build_cors() -> CorsLayer {
    // 如果需要跨域并携带凭证，请通过 CORS_ALLOW_ORIGIN 指定允许的来源（逗号分隔）。
    if let Ok(origins) = env::var("CORS_ALLOW_ORIGIN") {
        let origins: Vec<HeaderValue> = origins
            .split(',')
            .filter_map(|s| HeaderValue::from_str(s.trim()).ok())
            .collect();
        CorsLayer::new()
            .allow_methods([Method::GET, Method::POST, Method::DELETE, Method::PUT, Method::OPTIONS])
            .allow_headers([ACCEPT, CONTENT_TYPE, AUTHORIZATION])
            .allow_origin(origins)
            .allow_credentials(true)
    } else {
        // 同域部署不需要 CORS。为方便调试保留宽松的 Origin，但不允许携带凭证，避免与通配符冲突。
        CorsLayer::new()
            .allow_methods([Method::GET, Method::POST, Method::DELETE, Method::PUT, Method::OPTIONS])
            .allow_headers([ACCEPT, CONTENT_TYPE, AUTHORIZATION])
            .allow_origin(Any)
            // 不设置 allow_credentials(true)
    }
}

async fn health() -> impl IntoResponse {
    Json(serde_json::json!({ "message": "Good!" }))
}

#[derive(Deserialize)]
struct VerifyBody { password: String }

async fn auth_verify(State(state): State<AppState>, headers: HeaderMap, Json(body): Json<VerifyBody>) -> Response {
    let Some(expected) = state.password.clone() else {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error":"Authentication not configured on server"}))).into_response();
    };
    if body.password != expected {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"Invalid password"}))).into_response();
    }

    // derive scheme for cookie security
    let forwarded = headers.get("x-forwarded-proto").and_then(|v| v.to_str().ok());
    let scheme = forwarded.unwrap_or("http").to_ascii_lowercase();
    let secure = scheme == "https";
    let samesite_env = env::var("AUTH_COOKIE_SAMESITE").unwrap_or_else(|_| "Lax".to_string());
    let samesite = match samesite_env.to_ascii_lowercase().as_str() { "none" => "None", "strict" => "Strict", _ => "Lax" };
    // Cookie 有效期：默认 7 天（可通过 AUTH_MAX_AGE_SECONDS 配置，单位：秒）
    let max_age: i64 = env::var("AUTH_MAX_AGE_SECONDS")
        .ok()
        .and_then(|s| s.parse::<i64>().ok())
        .filter(|v| *v > 0)
        .unwrap_or(604800); // 7 days
    let cookie = format!(
        "auth={}; Max-Age={}; Path=/; SameSite={}; HttpOnly{}",
        expected,
        max_age,
        samesite,
        if secure || samesite == "None" { "; Secure" } else { "" }
    );
    let mut res = Json(serde_json::json!({"success": true})).into_response();
    res.headers_mut().insert("set-cookie", HeaderValue::from_str(&cookie).unwrap());
    res
}

async fn auth_logout(headers: HeaderMap) -> Response {
    // 与登录时保持相同的 Cookie 属性
    let forwarded = headers.get("x-forwarded-proto").and_then(|v| v.to_str().ok());
    let scheme = forwarded.unwrap_or("http").to_ascii_lowercase();
    let secure = scheme == "https";
    let samesite_env = env::var("AUTH_COOKIE_SAMESITE").unwrap_or_else(|_| "Lax".to_string());
    let samesite = match samesite_env.to_ascii_lowercase().as_str() { "none" => "None", "strict" => "Strict", _ => "Lax" };
    // 立刻过期
    let cookie = format!(
        "auth=; Max-Age=0; Path=/; SameSite={}; HttpOnly{}",
        samesite,
        if secure || samesite == "None" { "; Secure" } else { "" }
    );
    let mut res = Json(serde_json::json!({"success": true})).into_response();
    res.headers_mut().insert("set-cookie", HeaderValue::from_str(&cookie).unwrap());
    res
}

async fn auth_mw(State(state): State<AppState>, req: Request, next: axum::middleware::Next) -> Response {
    // allow unauthenticated endpoints: /api/auth/verify and public share endpoints
    let path = req.uri().path();
    if path.starts_with("/api/auth/verify") || path.starts_with("/api/healthz") {
        return next.run(req).await;
    }
    if path.starts_with("/api/share/") {
        let parts: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
        if parts.len() >= 3 {
            let method = req.method().clone();
            let tail = parts.get(3).copied().unwrap_or("");
            if (parts.len() == 3 && method == Method::GET)
                || (tail == "verify" && method == Method::POST)
                || (tail == "file" && method == Method::GET)
                || (tail == "download" && method == Method::GET)
            {
                return next.run(req).await;
            }
        }
    }
    // Check password
    let expected = match state.password.as_ref() { Some(p) => p, None => {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error":"Authentication not configured on server"}))).into_response();
    }};

    // Authorization: Bearer <password> or Cookie: auth=<password>
    let headers = req.headers();
    let mut ok = false;
    if let Some(auth) = headers.get(axum::http::header::AUTHORIZATION).and_then(|v| v.to_str().ok()) {
        if let Some(token) = auth.strip_prefix("Bearer ") {
            if token == expected.as_str() { ok = true; }
        }
    }
    if !ok {
        if let Some(cookie) = headers.get(axum::http::header::COOKIE).and_then(|v| v.to_str().ok()) {
            for part in cookie.split(';') {
                let part = part.trim();
                if let Some(v) = part.strip_prefix("auth=") { if v == expected.as_str() { ok = true; break; } }
            }
        }
    }
    if !ok {
        // Optional query-based auth: enable by setting ALLOW_QUERY_AUTH=1 (useful for SSE with cross-site cookies blocked)
        let allow_q = env::var("ALLOW_QUERY_AUTH").ok().map(|v| matches!(v.to_ascii_lowercase().as_str(), "1"|"true"|"yes")).unwrap_or(false);
        if allow_q { if let Some(q) = req.uri().query() { for (k,v) in form_urlencoded::parse(q.as_bytes()) { if k=="auth" && v.as_ref()==expected.as_str() { ok = true; break; } } } }
    }
    if !ok {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"Unauthorized"}))).into_response();
    }
    next.run(req).await
}

async fn sse_events(State(state): State<AppState>) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let mut rx = state.tx.subscribe();

    // stream of broadcasted events
    let broadcast_stream = async_stream::stream! {
        loop {
            match rx.recv().await {
                Ok(ev) => {
                    let data = serde_json::to_string(&ev.data).unwrap_or("{}".into());
                    let e = Event::default().event(ev.name).data(data);
                    yield Ok::<Event, Infallible>(e);
                }
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    };

    // initial ready + periodic ping
    let ready = stream::once(async { Ok::<Event, Infallible>(Event::default().event("ready").data("{}")) });
    let ping_stream = tokio_stream::wrappers::IntervalStream::new(tokio_time::interval(Duration::from_millis(25_000)))
        .map(|_| Ok::<Event, Infallible>(Event::default().event("ping").data("{}")));

    // Merge ping and broadcast so both can be delivered concurrently
    let merged = stream::select(ping_stream, broadcast_stream);
    let s = ready.chain(merged);

    Sse::new(s).keep_alive(KeepAlive::new().interval(Duration::from_secs(25)).text("keep-alive"))
}

#[derive(Deserialize)]
struct DevBroadcastReq { event: String, #[serde(default)] data: serde_json::Value }

async fn dev_broadcast(State(state): State<AppState>, Json(req): Json<DevBroadcastReq>) -> impl IntoResponse {
    let _ = state.tx.send(ServerEvent { name: req.event, data: req.data });
    Json(serde_json::json!({"ok": true}))
}

// -------------------- SQLite & Models --------------------

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "UPPERCASE")]
enum ItemType { Text, Image, File }

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ClipboardItem {
    id: String,
    #[serde(rename = "type")]
    item_type: ItemType,
    content: Option<String>,
    file_name: Option<String>,
    file_size: Option<i64>,
    sort_weight: i64,
    content_type: Option<String>,
    // backend fields
    inline_data: Option<Vec<u8>>,
    file_path: Option<String>,
    created_at: String,
    updated_at: String,
}

fn ensure_data_dirs() -> anyhow::Result<PathBuf> {
    // Always prefer repository root's `data/` regardless of current working directory.
    // Detect repo root by finding an ancestor containing `rust-server/Cargo.toml`.
    let cwd = env::current_dir()?;
    let mut repo_root: Option<PathBuf> = None;
    for anc in cwd.ancestors() {
        let marker = anc.join("rust-server").join("Cargo.toml");
        if marker.exists() {
            repo_root = Some(anc.to_path_buf());
            break;
        }
    }
    let base = repo_root.unwrap_or(cwd);
    let data_dir = base.join("data");
    stdfs::create_dir_all(data_dir.join("uploads"))?;
    Ok(data_dir)
}

fn init_db(data_dir: &StdPath) -> anyhow::Result<Connection> {
    let db_path = data_dir.join("custom.db");
    let conn = Connection::open(db_path)?;
    conn.execute_batch(
        r#"
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS ClipboardItem (
          id TEXT PRIMARY KEY NOT NULL,
          type TEXT NOT NULL,
          content TEXT,
          fileName TEXT,
          fileSize INTEGER,
          sortWeight INTEGER NOT NULL DEFAULT 0,
          contentType TEXT,
          inlineData BLOB,
          filePath TEXT,
          createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
          updatedAt INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS clipboard_created_idx ON ClipboardItem (createdAt, id);

        CREATE TABLE IF NOT EXISTS ShareLink (
          token TEXT PRIMARY KEY NOT NULL,
          itemId TEXT NOT NULL,
          expiresAt INTEGER,
          maxDownloads INTEGER,
          downloadCount INTEGER NOT NULL DEFAULT 0,
          revoked INTEGER NOT NULL DEFAULT 0,
          passwordHash TEXT,
          createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
          updatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
          CONSTRAINT share_item_fk FOREIGN KEY (itemId) REFERENCES ClipboardItem(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS share_item_idx ON ShareLink (itemId);
        CREATE INDEX IF NOT EXISTS share_created_idx ON ShareLink (createdAt);
        "#,
    )?;
    Ok(conn)
}

fn now_unix() -> i64 { OffsetDateTime::now_utc().unix_timestamp() }

// -------------------- Clipboard Handlers --------------------

async fn list_clipboard(State(state): State<AppState>, uri: Uri) -> impl IntoResponse {
    let q = uri.query().unwrap_or("");
    let params: Vec<(String, String)> = form_urlencoded::parse(q.as_bytes()).into_owned().collect();
    let mut search: Option<String> = None;
    let mut take: usize = 24;
    let mut cursor_created_at: Option<i64> = None;
    let mut cursor_id: Option<String> = None;
    let mut cursor_sort: Option<i64> = None;
    for (k, v) in params {
        match k.as_str() {
            "search" => search = Some(v),
            "take" => take = v.parse::<usize>().ok().map(|n| n.clamp(1, 48)).unwrap_or(24),
            "cursorCreatedAt" => {
                // Try parse as i64 (unix ts) or RFC3339 string
                if let Ok(ts) = v.parse::<i64>() { cursor_created_at = Some(ts); }
                else if let Ok(dt) = time::OffsetDateTime::parse(&v, &time::format_description::well_known::Rfc3339) { cursor_created_at = Some(dt.unix_timestamp()); }
            }
            "cursorId" => cursor_id = Some(v),
            "cursorSortWeight" => cursor_sort = v.parse::<i64>().ok(),
            _ => {}
        }
    }
    let conn = state.db.lock().unwrap();
    let mut sql = String::from("SELECT id,type,content,fileName,fileSize,sortWeight,contentType,inlineData,filePath,createdAt,updatedAt FROM ClipboardItem");
    let mut where_clauses: Vec<String> = vec![];
    let mut params_vec: Vec<rusqlite::types::Value> = vec![];
    if let Some(s) = &search {
        where_clauses.push("(content LIKE ? OR fileName LIKE ?)".into());
        let like = format!("%{}%", s);
        params_vec.push(like.clone().into());
        params_vec.push(like.into());
    }
    if let (Some(ca), Some(cid)) = (cursor_created_at, cursor_id.as_ref()) {
        if let Some(cs) = cursor_sort {
            where_clauses.push("(sortWeight < ? OR (sortWeight = ? AND (createdAt < ? OR (createdAt = ? AND id < ?))))".into());
            params_vec.push(cs.into());
            params_vec.push(cs.into());
            params_vec.push(ca.into());
            params_vec.push(ca.into());
            params_vec.push(cid.clone().into());
        } else {
            where_clauses.push("(createdAt < ? OR (createdAt = ? AND id < ?))".into());
            params_vec.push(ca.into());
            params_vec.push(ca.into());
            params_vec.push(cid.clone().into());
        }
    }
    if !where_clauses.is_empty() { sql.push_str(" WHERE "); sql.push_str(&where_clauses.join(" AND ")); }
    sql.push_str(" ORDER BY sortWeight DESC, createdAt DESC, id DESC LIMIT ?");
    params_vec.push(((take as i64)+1).into());

    let mut stmt = conn.prepare(&sql).unwrap();
    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|v| v as &dyn rusqlite::ToSql).collect();
    let rows = stmt.query_map(params_refs.as_slice(), |r| {
        Ok(ClipboardItem{
            id: r.get(0)?,
            item_type: match r.get::<_, String>(1)?.as_str() { "TEXT"=>ItemType::Text, "IMAGE"=>ItemType::Image, _=>ItemType::File },
            content: r.get(2).ok(),
            file_name: r.get(3).ok(),
            file_size: r.get(4).ok(),
            sort_weight: r.get(5).unwrap_or(0),
            content_type: r.get(6).ok(),
            inline_data: None,
            file_path: None,
            created_at: epoch_to_iso(r.get::<_, i64>(9).unwrap_or(0)),
            updated_at: epoch_to_iso(r.get::<_, i64>(10).unwrap_or(0)),
        })
    }).unwrap().collect::<Result<Vec<_>, _>>().unwrap();
    let has_more = rows.len() > take; let items = if has_more { rows[..take].to_vec() } else { rows.clone() };
    let next_cursor = if has_more { Some(serde_json::json!({"id": items.last().unwrap().id, "createdAt": items.last().unwrap().created_at, "sortWeight": items.last().unwrap().sort_weight })) } else { None };
    Json(serde_json::json!({"items": items, "nextCursor": next_cursor, "hasMore": has_more}))
}

fn epoch_to_iso(ts: i64) -> String { OffsetDateTime::from_unix_timestamp(ts).unwrap_or(OffsetDateTime::now_utc()).format(&time::format_description::well_known::Rfc3339).unwrap_or_default() }

#[derive(Deserialize)]
#[serde(rename_all = "UPPERCASE")]
enum InType { Text, Image, File }

async fn create_clipboard(State(state): State<AppState>, mut multipart: Multipart) -> impl IntoResponse {
    const MAX_INLINE: usize = 256*1024;
    let mut content: Option<String> = None; let mut in_type: Option<InType> = None;
    let mut file_name: Option<String> = None; let mut content_type: Option<String> = None; let mut file_size: Option<i64> = None;
    let mut inline_data: Option<Vec<u8>> = None; let mut file_path_rel: Option<String> = None;
    while let Some(field) = multipart.next_field().await.unwrap_or(None) {
        let name = field.name().map(|s| s.to_string());
        match name.as_deref() {
            Some("content") => { content = Some(field.text().await.unwrap_or_default()); },
            Some("type") => { let v = field.text().await.unwrap_or_default(); in_type = match v.as_str() { "TEXT"=>Some(InType::Text), "IMAGE"=>Some(InType::Image), "FILE"=>Some(InType::File), _=>None }; },
            Some("file") => {
                let fname = field.file_name().map(|s| s.to_string());
                let ctype = field.content_type().map(|s| s.to_string());
                file_name = fname;
                content_type = ctype;

                let mut total: usize = 0;
                let mut buf: Vec<u8> = Vec::new();
                let mut fh: Option<tokio::fs::File> = None;
                let mut rel_path: Option<String> = None;

                let mut field_stream = field;
                while let Some(chunk) = field_stream.chunk().await.unwrap_or(None) {
                    total += chunk.len();

                    if fh.is_none() && total <= MAX_INLINE {
                        buf.extend_from_slice(&chunk);
                    } else {
                        if fh.is_none() {
                            // Switch to file writing: decide filename and open handle
                            let rand_id = Uuid::new_v4().to_string();
                            let ext = file_name.as_ref().and_then(|n| std::path::Path::new(n).extension().and_then(|s| s.to_str())).unwrap_or("");
                            let gen = if ext.is_empty() { rand_id } else { format!("{}.{ext}", rand_id) };
                            let abs = state.data_dir.join("uploads").join(&gen);
                            match tokio::fs::File::create(&abs).await {
                                Ok(mut f) => {
                                    if !buf.is_empty() {
                                        if let Err(_e) = f.write_all(&buf).await { return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error":"write failed"}))).into_response(); }
                                    }
                                    fh = Some(f);
                                    rel_path = Some(format!("uploads/{}", gen));
                                }
                                Err(_e) => { return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error":"open failed"}))).into_response(); }
                            }
                        }
                        if let Some(f) = fh.as_mut() {
                            if let Err(_e) = f.write_all(&chunk).await { return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error":"write failed"}))).into_response(); }
                        }
                    }
                }

                file_size = Some(total as i64);
                if let Some(rp) = rel_path { file_path_rel = Some(rp); inline_data = None; }
                else { inline_data = Some(buf); }
            },
            _ => {}
        }
    }
    if content.is_none() && inline_data.is_none() && file_path_rel.is_none() { return (StatusCode::BAD_REQUEST, Json(serde_json::json!({"error":"Content or file is required"}))).into_response(); }
    let id = Uuid::new_v4().to_string(); let t = match in_type.unwrap_or(InType::Text) { InType::Text=>"TEXT", InType::Image=>"IMAGE", InType::File=>"FILE" };
    let now = now_unix();
    // Assign new items the highest sortWeight so they always appear first
    let new_weight: i64 = {
        let conn = state.db.lock().unwrap();
        let max: i64 = conn.query_row("SELECT COALESCE(MAX(sortWeight),0) FROM ClipboardItem", [], |r| r.get(0)).unwrap_or(0);
        let w = max + 1;
        if let Err(e) = conn.execute(
            "INSERT INTO ClipboardItem (id,type,content,fileName,fileSize,sortWeight,contentType,inlineData,filePath,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?, ?, ?, ?, ?)",
            params![id, t, content, file_name, file_size, w, content_type, inline_data, file_path_rel, now, now]
        ) {
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error":"db write failed","detail": e.to_string()}))).into_response();
        }
        w
    };
    // select minimal fields for broadcast
    let item = serde_json::json!({
        "id": id,
        "type": t,
        "content": content,
        "fileName": file_name,
        "fileSize": file_size,
        "sortWeight": new_weight,
        "createdAt": OffsetDateTime::from_unix_timestamp(now).unwrap().format(&time::format_description::well_known::Rfc3339).unwrap_or_default(),
        "updatedAt": OffsetDateTime::from_unix_timestamp(now).unwrap().format(&time::format_description::well_known::Rfc3339).unwrap_or_default(),
    });
    let _ = state.tx.send(ServerEvent { name: "clipboard:created".into(), data: item.clone() });
    (StatusCode::CREATED, Json(item)).into_response()
}

async fn get_clipboard(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn.prepare("SELECT id,type,content,fileName,fileSize,sortWeight,contentType,inlineData,filePath,createdAt,updatedAt FROM ClipboardItem WHERE id=? LIMIT 1").unwrap();
    let row = stmt.query_row([id.clone()], |r| Ok(ClipboardItem{
        id: r.get(0)?, item_type: match r.get::<_,String>(1)?.as_str(){"TEXT"=>ItemType::Text,"IMAGE"=>ItemType::Image,_=>ItemType::File}, content: r.get(2).ok(), file_name: r.get(3).ok(), file_size: r.get(4).ok(), sort_weight: r.get(5).unwrap_or(0), content_type: r.get(6).ok(), inline_data: r.get(7).ok(), file_path: r.get(8).ok(), created_at: epoch_to_iso(r.get::<_,i64>(9).unwrap_or(0)), updated_at: epoch_to_iso(r.get::<_,i64>(10).unwrap_or(0)),
    }));
    match row { Ok(mut item)=>{ item.inline_data=None; Json(item).into_response() }, Err(_)=> (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"Not found"}))).into_response() }
}

#[derive(Deserialize)]
struct ReorderReq { ids: Vec<String> }

async fn reorder_clipboard(State(state): State<AppState>, Json(req): Json<ReorderReq>) -> impl IntoResponse {
    if req.ids.is_empty() { return Json(serde_json::json!({"ok": true})); }
    let now = now_unix();
    let conn = state.db.lock().unwrap();
    let max: i64 = conn.query_row("SELECT COALESCE(MAX(sortWeight),0) FROM ClipboardItem", [], |r| r.get(0)).unwrap_or(0);
    let base = max + (req.ids.len() as i64);
    let tx = conn.unchecked_transaction().unwrap();
    let mut weights: Vec<(String, i64)> = Vec::with_capacity(req.ids.len());
    for (i, id) in req.ids.iter().enumerate() {
        let new_weight = base - (i as i64);
        tx.execute("UPDATE ClipboardItem SET sortWeight=?, updatedAt=? WHERE id=?", params![new_weight, now, id]).ok();
        weights.push((id.clone(), new_weight));
    }
    tx.commit().ok();
    // Build weights mapping for SSE so clients can update local state precisely
    let mut weights_map = serde_json::Map::new();
    for (id, w) in &weights { weights_map.insert(id.clone(), serde_json::json!(*w)); }
    let data = serde_json::json!({
        "ids": req.ids,
        "weights": serde_json::Value::Object(weights_map),
    });
    let _ = state.tx.send(ServerEvent { name: "clipboard:reordered".into(), data });
    Json(serde_json::json!({"ok": true}))
}

async fn delete_clipboard(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let file_path: Option<String> = {
        let conn = state.db.lock().unwrap();
        let mut stmt = conn.prepare("SELECT filePath FROM ClipboardItem WHERE id=?").unwrap();
        let fp = stmt.query_row([id.clone()], |r| r.get::<_, Option<String>>(0)).ok().flatten();
        conn.execute("DELETE FROM ClipboardItem WHERE id=?", [id.clone()]).ok();
        fp
    };
    if let Some(rel) = file_path { let abs = state.data_dir.join(rel); let _ = stdfs::remove_file(abs); }
    let _ = state.tx.send(ServerEvent { name: "clipboard:deleted".into(), data: serde_json::json!({"id": id})});
    Json(serde_json::json!({"ok": true}))
}

type DbFileRow = (Option<String>, Option<Vec<u8>>, Option<String>, Option<String>);

async fn get_file(State(state): State<AppState>, Path(id): Path<String>, uri: Uri) -> impl IntoResponse {
    let q = uri.query().unwrap_or("");
    let want_download = form_urlencoded::parse(q.as_bytes()).into_owned().any(|(k,v)| k=="download" && matches!(v.as_str(), "1"|"true"|"yes"));
    let row: Option<DbFileRow> = {
        let conn = state.db.lock().unwrap();
        let mut stmt = conn.prepare("SELECT filePath, inlineData, fileName, contentType FROM ClipboardItem WHERE id=? LIMIT 1").unwrap();
        stmt.query_row([id.clone()], |r| Ok((r.get(0).ok(), r.get(1).ok(), r.get(2).ok(), r.get(3).ok()))).ok()
    };
    if row.is_none() { return (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"Not found"}))).into_response(); }
    let (file_path, inline, file_name, content_type) = row.unwrap();
    let filename = file_name.unwrap_or_else(|| "download".into()); let ctype = content_type.unwrap_or_else(|| "application/octet-stream".into());
    let mut headers = axum::http::HeaderMap::new();
    headers.insert(axum::http::header::CONTENT_TYPE, HeaderValue::from_str(&ctype).unwrap());
    let disp = format!("{}; filename*=UTF-8''{}", if want_download {"attachment"} else {"inline"}, urlencoding::encode(&filename));
    headers.insert(axum::http::header::CONTENT_DISPOSITION, HeaderValue::from_str(&disp).unwrap());
    // Strong caching: file content is immutable by id; allow long-lived cache to speed up subsequent fetches
    headers.insert(axum::http::header::CACHE_CONTROL, HeaderValue::from_static("public, max-age=31536000, immutable"));
    if let Some(rel) = file_path {
        let abs = state.data_dir.join(rel);
        if let Ok(meta) = tokio::fs::metadata(&abs).await { headers.insert(axum::http::header::CONTENT_LENGTH, HeaderValue::from_str(&meta.len().to_string()).unwrap()); }
        match tokio::fs::File::open(&abs).await {
            Ok(f) => {
                let stream = ReaderStream::new(f);
                let body = Body::from_stream(stream);
                (StatusCode::OK, headers, body).into_response()
            }
            Err(_) => (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"missing"}))).into_response(),
        }
    } else if let Some(buf) = inline {
        (StatusCode::OK, headers, buf).into_response()
    } else {
        (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"missing content"}))).into_response()
    }
}

// -------------------- Share Handlers --------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShareCreateReq {
    item_id: String,
    expires_in: Option<i64>,
    expires_at: Option<String>,
    max_downloads: Option<i64>,
    password: Option<String>,
}

async fn share_create(State(state): State<AppState>, Json(req): Json<ShareCreateReq>) -> impl IntoResponse {
    if req.item_id.is_empty() { return (StatusCode::BAD_REQUEST, Json(serde_json::json!({"error":"itemId is required"}))).into_response(); }
    // ensure item exists
    {
        let conn = state.db.lock().unwrap();
        let mut st = conn.prepare("SELECT 1 FROM ClipboardItem WHERE id=? LIMIT 1").unwrap();
        let exists = st.exists([req.item_id.clone()]).unwrap_or(false);
        if !exists { return (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"Item not found"}))).into_response(); }
    }

    // compute expiresAt (unix seconds)
    let mut expires_at: Option<i64> = None;
    if let Some(s) = req.expires_at.as_ref() { if let Ok(dt) = time::OffsetDateTime::parse(s, &time::format_description::well_known::Rfc3339) { expires_at = Some(dt.unix_timestamp()); }}
    if expires_at.is_none() {
        if let Some(sec) = req.expires_in { if sec > 0 { expires_at = Some(now_unix() + sec); } }
    }

    // token: 18 random bytes -> base64url no pad
    let mut buf = [0u8; 18]; rand::thread_rng().fill_bytes(&mut buf);
    let token = B64_URL_SAFE_NO_PAD.encode(buf);

    // password hash
    let password_hash: Option<String> = req.password.as_ref().and_then(|p| if p.trim().is_empty() { None } else {
        let mut hasher = Sha256::new(); hasher.update(p.as_bytes()); hasher.update(b"|"); hasher.update(token.as_bytes());
        Some(format!("{:x}", hasher.finalize()))
    });

    let now = now_unix();
    {
        let conn = state.db.lock().unwrap();
        conn.execute(
            "INSERT INTO ShareLink (token,itemId,expiresAt,maxDownloads,downloadCount,revoked,passwordHash,createdAt,updatedAt) VALUES (?,?,?,?,0,0,?,?,?)",
            params![token, req.item_id, expires_at, req.max_downloads, password_hash, now, now]
        ).unwrap();
    }
    let url = format!("/s/?token={}", token);
    Json(serde_json::json!({"token": token, "url": url, "expiresAt": expires_at.map(epoch_to_iso), "maxDownloads": req.max_downloads, "requiresPassword": password_hash.is_some()})).into_response()
}

// removed unused ShareListQuery struct (manual query parsing implemented)

async fn share_list(State(state): State<AppState>, uri: Uri) -> impl IntoResponse {
    let q = uri.query().unwrap_or("");
    let params: Vec<(String, String)> = form_urlencoded::parse(q.as_bytes()).into_owned().collect();
    let mut item_id: Option<String> = None; let mut include_revoked=false; let mut include_invalid=false; let mut page: usize=1; let mut page_size: usize=20;
    for (k,v) in params { match k.as_str(){
        "itemId"=> item_id=Some(v),
        "includeRevoked"=> include_revoked = matches!(v.to_lowercase().as_str(),"1"|"true"|"yes"),
        "includeInvalid"=> include_invalid = matches!(v.to_lowercase().as_str(),"1"|"true"|"yes"),
        "page"=> page = v.parse::<usize>().ok().map(|n| if n<1 {1} else {n}).unwrap_or(1),
        "pageSize"=> page_size = v.parse::<usize>().ok().map(|n| n.clamp(1,100)).unwrap_or(20),
        _=>{}
    }}
    let skip = (page-1)*page_size;
    let conn = state.db.lock().unwrap();
    // build where
    let mut where_sql = String::new(); let mut pv: Vec<rusqlite::types::Value> = vec![];
    if let Some(id)=item_id.as_ref(){ where_sql.push_str(" WHERE itemId = ?"); pv.push(id.clone().into()); }
    if !include_invalid && !include_revoked { if where_sql.is_empty(){ where_sql.push_str(" WHERE revoked = 0"); } else { where_sql.push_str(" AND revoked = 0"); } }
    let sql = format!("SELECT token,itemId,expiresAt,maxDownloads,downloadCount,revoked,passwordHash,createdAt,updatedAt FROM ShareLink{} ORDER BY createdAt DESC LIMIT ? OFFSET ?", where_sql);
    pv.push((page_size as i64 + 1).into()); pv.push((skip as i64).into());
    let mut st = conn.prepare(&sql).unwrap();
    let refs: Vec<&dyn rusqlite::ToSql> = pv.iter().map(|v| v as &dyn rusqlite::ToSql).collect();
    let mut rows = st.query(refs.as_slice()).unwrap();
    let mut items: Vec<serde_json::Value> = vec![]; let now = now_unix();
    while let Some(r) = rows.next().unwrap() {
        let token: String = r.get(0).unwrap(); let item_id: String = r.get(1).unwrap(); let exp: Option<i64> = r.get(2).ok(); let max: Option<i64> = r.get(3).ok(); let dcnt: i64 = r.get(4).unwrap_or(0); let revoked: i64 = r.get(5).unwrap_or(0); let pwd: Option<String> = r.get(6).ok(); let created: i64 = r.get(7).unwrap_or(0);
        // join item minimal
        let (itype, fname, fsize):(String, Option<String>, Option<i64>) = conn.query_row("SELECT type,fileName,fileSize FROM ClipboardItem WHERE id=?", [item_id.clone()], |rr| Ok((rr.get(0)?, rr.get(1).ok(), rr.get(2).ok()))).unwrap_or(("FILE".into(), None, None));
        let expired = exp.map(|e| e < now).unwrap_or(false);
        let exhausted = max.map(|m| m>=0 && dcnt>=m).unwrap_or(false);
        if !include_invalid && (revoked!=0 || expired || exhausted) { continue; }
        items.push(serde_json::json!({
            "token": token,
            "url": format!("/s?token={}", token),
            "item": {"id": item_id, "type": itype, "fileName": fname, "fileSize": fsize},
            "expiresAt": exp.map(epoch_to_iso),
            "maxDownloads": max,
            "downloadCount": dcnt,
            "revoked": revoked!=0,
            "requiresPassword": pwd.is_some(),
            "createdAt": epoch_to_iso(created),
        }));
    }
    let has_more = items.len() > page_size; let page_items = if has_more { items[..page_size].to_vec() } else { items.clone() };
    Json(serde_json::json!({"data": page_items, "page": page, "pageSize": page_size, "hasMore": has_more}))
}

async fn share_revoke(State(state): State<AppState>, Path(token): Path<String>) -> impl IntoResponse {
    let conn = state.db.lock().unwrap();
    let n = conn.execute("UPDATE ShareLink SET revoked=1, updatedAt=? WHERE token=?", params![now_unix(), token]).unwrap_or(0);
    if n==0 { return (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"not found"}))).into_response(); }
    Json(serde_json::json!({"ok": true})).into_response()
}

async fn share_delete(State(state): State<AppState>, Path(token): Path<String>) -> impl IntoResponse {
    let conn = state.db.lock().unwrap();
    let n = conn.execute("DELETE FROM ShareLink WHERE token=?", params![token]).unwrap_or(0);
    if n==0 { return (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"not found"}))).into_response(); }
    Json(serde_json::json!({"ok": true})).into_response()
}

// share_valid_row removed (no longer used)

async fn share_meta(State(state): State<AppState>, headers: HeaderMap, Path(token): Path<String>) -> impl IntoResponse {
    let conn = state.db.lock().unwrap();
    let mut st = conn.prepare("SELECT token,itemId,expiresAt,maxDownloads,downloadCount,revoked,passwordHash,createdAt,updatedAt FROM ShareLink WHERE token=? LIMIT 1").unwrap();
    let row_opt = st.query_row([token.clone()], |r| Ok((
        r.get::<_,String>(0)?, r.get::<_,String>(1)?, r.get::<_,Option<i64>>(2).ok().flatten(), r.get::<_,Option<i64>>(3).ok().flatten(), r.get::<_,i64>(4).unwrap_or(0), r.get::<_,i64>(5).unwrap_or(0), r.get::<_,Option<String>>(6).ok().flatten(), r.get::<_,i64>(7).unwrap_or(0), r.get::<_,i64>(8).unwrap_or(0)
    ))).ok();
    if row_opt.is_none() { return (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"not found"}))).into_response(); }
    let (token_s,item_id,exp,max,dcnt,revoked,pwd_hash,_created,_updated) = row_opt.unwrap();
    // validity
    if revoked!=0 || exp.map(|e| e<now_unix()).unwrap_or(false) || max.map(|m| m>=0 && dcnt>=m).unwrap_or(false) {
        return (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"not found"}))).into_response();
    }
    // authorization
    let mut authorized = true; let needs_pwd = pwd_hash.is_some();
    if needs_pwd {
        authorized = headers.get(axum::http::header::COOKIE).and_then(|v| v.to_str().ok()).map(|c| c.split(';').any(|p| p.trim()==format!("share_auth_{}={}", token_s, pwd_hash.as_ref().unwrap()))).unwrap_or(false);
    }
    // item meta
    let (itype, fname, fsize, ctype, content):(String, Option<String>, Option<i64>, Option<String>, Option<String>) = conn.query_row("SELECT type,fileName,fileSize,contentType,content FROM ClipboardItem WHERE id=?", [item_id.clone()], |rr| Ok((rr.get(0)?, rr.get(1).ok(), rr.get(2).ok(), rr.get(3).ok(), rr.get(4).ok()))).unwrap_or(("FILE".into(), None, None, None, None));
    Json(serde_json::json!({
        "token": token_s,
        "item": {"id": item_id, "type": itype, "fileName": fname, "fileSize": fsize, "contentType": ctype, "content": if authorized && itype=="TEXT" { content } else { None } },
        "expiresAt": exp.map(epoch_to_iso),
        "maxDownloads": max,
        "downloadCount": dcnt,
        "requiresPassword": needs_pwd,
        "authorized": authorized,
    })).into_response()
}

#[derive(Deserialize)]
struct ShareVerifyReq { password: String }

async fn share_verify(State(state): State<AppState>, headers: HeaderMap, Path(token): Path<String>, Json(body): Json<ShareVerifyReq>) -> impl IntoResponse {
    let conn = state.db.lock().unwrap();
    let pwd_hash: Option<String> = conn.query_row("SELECT passwordHash FROM ShareLink WHERE token=?", [token.clone()], |r| r.get(0)).ok();
    if pwd_hash.is_none() { return (StatusCode::BAD_REQUEST, Json(serde_json::json!({"error":"no password set"}))).into_response(); }
    let expected = pwd_hash.unwrap();
    let mut hasher = Sha256::new(); hasher.update(body.password.as_bytes()); hasher.update(b"|"); hasher.update(token.as_bytes());
    let given = format!("{:x}", hasher.finalize());
    if given != expected { return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"invalid password"}))).into_response(); }
    // cookie
    let forwarded = headers.get("x-forwarded-proto").and_then(|v| v.to_str().ok()); let scheme = forwarded.unwrap_or("http").to_ascii_lowercase(); let secure = scheme=="https";
    let cookie = format!("share_auth_{}={}; Max-Age=604800; Path=/; SameSite=Lax; HttpOnly{}", token, expected, if secure{"; Secure"} else {""});
    let mut res = Json(serde_json::json!({"success": true})).into_response(); res.headers_mut().insert("set-cookie", HeaderValue::from_str(&cookie).unwrap()); res
}

async fn share_file_inner(state: AppState, token: String, headers: HeaderMap) -> impl IntoResponse {
    let row = {
        let conn = state.db.lock().unwrap();
        conn.query_row(
            "SELECT s.token, s.passwordHash, c.type, c.content, c.fileName, c.fileSize, c.contentType, c.filePath, c.inlineData FROM ShareLink s LEFT JOIN ClipboardItem c ON s.itemId=c.id WHERE s.token=?",
            [token.clone()],
            |r| Ok((
                r.get::<_,String>(0)?, r.get::<_,Option<String>>(1).ok().flatten(), r.get::<_,String>(2)?, r.get::<_,Option<String>>(3).ok().flatten(),
                r.get::<_,Option<String>>(4).ok().flatten(), r.get::<_,Option<i64>>(5).ok().flatten(), r.get::<_,Option<String>>(6).ok().flatten(),
                r.get::<_,Option<String>>(7).ok().flatten(), r.get::<_,Option<Vec<u8>>>(8).ok().flatten()
            ))
        ).ok()
    };
    if row.is_none() { return (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"not found"}))).into_response(); }
    let (token_s,pwd_hash,itype,content,fname,_fsize,ctype,fpath,inline) = row.unwrap();
    // auth
    if let Some(ph)=pwd_hash.as_ref(){
        let ok = headers.get(axum::http::header::COOKIE).and_then(|v| v.to_str().ok()).map(|c| c.split(';').any(|p| p.trim()==format!("share_auth_{}={}", token_s, ph))).unwrap_or(false);
        if !ok { return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"unauthorized"}))).into_response(); }
    }
    if itype=="TEXT" {
        let text = content.unwrap_or_default();
        return (StatusCode::OK, [(axum::http::header::CONTENT_TYPE, HeaderValue::from_static("text/plain; charset=utf-8"))], text).into_response();
    }
    let filename = fname.unwrap_or_else(|| "download".into()); let ctype = ctype.unwrap_or_else(|| "application/octet-stream".into());
    let mut headers_out = axum::http::HeaderMap::new(); headers_out.insert(axum::http::header::CONTENT_TYPE, HeaderValue::from_str(&ctype).unwrap());
    headers_out.insert(axum::http::header::CONTENT_DISPOSITION, HeaderValue::from_str(&format!("inline; filename*=UTF-8''{}", urlencoding::encode(&filename))).unwrap());
    if let Some(rel)=fpath { let abs = state.data_dir.join(rel); if let Ok(meta)=tokio::fs::metadata(&abs).await { headers_out.insert(axum::http::header::CONTENT_LENGTH, HeaderValue::from_str(&meta.len().to_string()).unwrap()); } match tokio::fs::File::open(&abs).await { Ok(f)=> { let stream=ReaderStream::new(f); let body=Body::from_stream(stream); return (StatusCode::OK, headers_out, body).into_response(); }, Err(_)=> return (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"missing"}))).into_response() } }
    if let Some(buf)=inline { return (StatusCode::OK, headers_out, buf).into_response(); }
    (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"missing content"}))).into_response()
}

async fn share_download_inner(state: AppState, token: String, headers: HeaderMap) -> impl IntoResponse {
    let row = {
        let conn = state.db.lock().unwrap();
        conn.query_row(
            "SELECT s.token, s.passwordHash, s.maxDownloads, s.downloadCount, c.type, c.content, c.fileName, c.fileSize, c.contentType, c.filePath, c.inlineData FROM ShareLink s LEFT JOIN ClipboardItem c ON s.itemId=c.id WHERE s.token=?",
            [token.clone()],
            |r| Ok((
                r.get::<_,String>(0)?, r.get::<_,Option<String>>(1).ok().flatten(), r.get::<_,Option<i64>>(2).ok().flatten(), r.get::<_,i64>(3).unwrap_or(0),
                r.get::<_,String>(4)?, r.get::<_,Option<String>>(5).ok().flatten(), r.get::<_,Option<String>>(6).ok().flatten(), r.get::<_,Option<i64>>(7).ok().flatten(),
                r.get::<_,Option<String>>(8).ok().flatten(), r.get::<_,Option<String>>(9).ok().flatten(), r.get::<_,Option<Vec<u8>>>(10).ok().flatten()
            ))
        ).ok()
    };
    if row.is_none() { return (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"not found"}))).into_response(); }
    let (token_s,pwd_hash,max,dcnt,itype,content,fname,_fsize,ctype,fpath,inline) = row.unwrap();
    if let Some(ph)=pwd_hash.as_ref(){ let ok = headers.get(axum::http::header::COOKIE).and_then(|v| v.to_str().ok()).map(|c| c.split(';').any(|p| p.trim()==format!("share_auth_{}={}", token_s, ph))).unwrap_or(false); if !ok { return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"unauthorized"}))).into_response(); } }
    if let Some(m)=max { if m>=0 && dcnt>=m { return (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"not found"}))).into_response(); } }
    // increment downloadCount best effort (separate lock scope; no await inside)
    {
        let conn = state.db.lock().unwrap();
        let _ = conn.execute("UPDATE ShareLink SET downloadCount=downloadCount+1, updatedAt=? WHERE token=?", params![now_unix(), token.clone()]);
    }
    if itype=="TEXT" { let text = content.unwrap_or_default(); let filename = format!("{}.txt", fname.unwrap_or_else(|| "download".into())); return (StatusCode::OK, [(axum::http::header::CONTENT_TYPE, HeaderValue::from_static("text/plain; charset=utf-8")), (axum::http::header::CONTENT_DISPOSITION, HeaderValue::from_str(&format!("attachment; filename*=UTF-8''{}", urlencoding::encode(&filename))).unwrap())], text).into_response(); }
    let filename = fname.unwrap_or_else(|| "download".into()); let ctype = ctype.unwrap_or_else(|| "application/octet-stream".into()); let mut headers_out = axum::http::HeaderMap::new(); headers_out.insert(axum::http::header::CONTENT_TYPE, HeaderValue::from_str(&ctype).unwrap()); headers_out.insert(axum::http::header::CONTENT_DISPOSITION, HeaderValue::from_str(&format!("attachment; filename*=UTF-8''{}", urlencoding::encode(&filename))).unwrap());
    if let Some(rel)=fpath { let abs = state.data_dir.join(rel); if let Ok(meta)=tokio::fs::metadata(&abs).await { headers_out.insert(axum::http::header::CONTENT_LENGTH, HeaderValue::from_str(&meta.len().to_string()).unwrap()); } match tokio::fs::File::open(&abs).await { Ok(f)=> { let stream=ReaderStream::new(f); let body=Body::from_stream(stream); return (StatusCode::OK, headers_out, body).into_response(); }, Err(_)=> return (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"missing"}))).into_response() } }
    if let Some(buf)=inline { return (StatusCode::OK, headers_out, buf).into_response(); }
    (StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"missing content"}))).into_response()
}
