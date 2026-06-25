mod protocol;
mod tools;

use anyhow::Result;
use clap::Parser;
use serde_json::json;
use std::io::{self, BufRead, Write};
use std::path::PathBuf;
use tracing::{debug, error, info};

use brainos_core::config::Config;
use brainos_core::embedding;
use brainos_core::Store;

use protocol::{
    InitializeResult, JsonRpcRequest, JsonRpcResponse, ServerCapabilities, ServerInfo,
    ToolsCapability, ToolsListResult,
};

#[derive(Parser)]
#[command(name = "brainos-mcp", about = "BrainOS MCP Server — expose your knowledge base to AI tools")]
struct Cli {
    /// Path to knowledge base root (default: from config or ~/knowledge-base)
    #[arg(long)]
    kb: Option<PathBuf>,

    /// Path to data directory for SQLite store (default: ~/Library/Application Support/brainos)
    #[arg(long)]
    data_dir: Option<PathBuf>,

    /// Allow write operations (brainos_capture, brainos_check_duplicate)
    #[arg(long, default_value_t = false)]
    allow_write: bool,
}

fn resolve_path(p: &PathBuf) -> PathBuf {
    if p.starts_with("~") {
        dirs::home_dir()
            .unwrap_or_default()
            .join(p.strip_prefix("~").unwrap())
    } else {
        p.clone()
    }
}

fn main() -> Result<()> {
    // Log to stderr so stdout stays clean for JSON-RPC
    tracing_subscriber::fmt()
        .with_writer(io::stderr)
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("brainos_mcp=info".parse().unwrap()),
        )
        .init();

    let cli = Cli::parse();

    // Resolve KB root
    let config = Config::load().unwrap_or_default();
    let kb_root = match &cli.kb {
        Some(p) => resolve_path(p),
        None => resolve_path(&config.general.kb_root),
    };

    info!("BrainOS MCP Server starting");
    info!("Knowledge base: {}", kb_root.display());
    info!("Write access: {}", cli.allow_write);

    // Open store
    let data_dir = match &cli.data_dir {
        Some(p) => resolve_path(p),
        None => Config::data_dir(),
    };
    let store = Store::open(&data_dir)?;
    info!("Store opened: {}", data_dir.display());

    // Lazy-init embedder on first vector search
    let embedder = embedding::try_init(&data_dir);
    if embedder.is_some() {
        info!("Embedder loaded — hybrid search enabled");
    } else {
        info!("Embedder not available — BM25-only search");
    }

    // Run stdio loop
    run_stdio_loop(&store, embedder.as_ref(), &kb_root, cli.allow_write, &config.search)?;

    Ok(())
}

fn run_stdio_loop(
    store: &Store,
    embedder: Option<&brainos_core::Embedder>,
    kb_root: &std::path::Path,
    allow_write: bool,
    search_config: &brainos_core::config::SearchConfig,
) -> Result<()> {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut reader = stdin.lock();
    let mut writer = stdout.lock();

    let mut line = String::new();

    loop {
        line.clear();
        let bytes_read = reader.read_line(&mut line)?;
        if bytes_read == 0 {
            // EOF — client disconnected
            info!("Client disconnected (EOF)");
            break;
        }

        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        debug!("← {}", trimmed);

        let request: JsonRpcRequest = match serde_json::from_str(trimmed) {
            Ok(r) => r,
            Err(e) => {
                let resp = JsonRpcResponse::error(None, -32700, format!("Parse error: {e}"));
                send_response(&mut writer, &resp)?;
                continue;
            }
        };

        if let Some(response) = handle_request(&request, store, embedder, kb_root, allow_write, search_config) {
            send_response(&mut writer, &response)?;
        }
    }

    Ok(())
}

fn send_response(writer: &mut impl Write, response: &JsonRpcResponse) -> Result<()> {
    let json = serde_json::to_string(response)?;
    debug!("→ {}", json);
    writeln!(writer, "{}", json)?;
    writer.flush()?;
    Ok(())
}

fn handle_request(
    req: &JsonRpcRequest,
    store: &Store,
    embedder: Option<&brainos_core::Embedder>,
    kb_root: &std::path::Path,
    allow_write: bool,
    search_config: &brainos_core::config::SearchConfig,
) -> Option<JsonRpcResponse> {
    match req.method.as_str() {
        // ── MCP lifecycle ───────────────────────────────
        "initialize" => {
            let result = InitializeResult {
                protocol_version: "2024-11-05".into(),
                capabilities: ServerCapabilities {
                    tools: ToolsCapability { list_changed: false },
                },
                server_info: ServerInfo {
                    name: "brainos-mcp".into(),
                    version: env!("CARGO_PKG_VERSION").into(),
                },
            };
            Some(JsonRpcResponse::success(req.id.clone(), serde_json::to_value(result).unwrap()))
        }

        // Notification — no response per JSON-RPC spec
        "initialized" | "notifications/cancelled" => None,

        // ── Tool listing ────────────────────────────────
        "tools/list" => {
            let mut all_tools = tools::read_tools();
            if allow_write {
                all_tools.extend(tools::write_tools());
            }
            let result = ToolsListResult { tools: all_tools };
            Some(JsonRpcResponse::success(req.id.clone(), serde_json::to_value(result).unwrap()))
        }

        // ── Tool execution ──────────────────────────────
        "tools/call" => {
            let name = req.params.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let arguments = req.params.get("arguments").cloned().unwrap_or(json!({}));

            let result = tools::handle_tool(
                name, &arguments, store, embedder, kb_root, allow_write, search_config,
            );
            Some(JsonRpcResponse::success(req.id.clone(), serde_json::to_value(result).unwrap()))
        }

        // ── Ping ────────────────────────────────────────
        "ping" => Some(JsonRpcResponse::success(req.id.clone(), json!({}))),

        // ── Unknown method ──────────────────────────────
        _ => {
            error!("Unknown method: {}", req.method);
            Some(JsonRpcResponse::error(req.id.clone(), -32601, format!("Method not found: {}", req.method)))
        }
    }
}
