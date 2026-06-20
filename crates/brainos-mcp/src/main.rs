use anyhow::Result;
use clap::Parser;
use std::path::PathBuf;
use tracing::info;

#[derive(Parser)]
#[command(name = "brainos-mcp", about = "BrainOS MCP Server")]
struct Cli {
    /// Path to knowledge base root
    #[arg(long, default_value = "~/brainos")]
    kb: PathBuf,

    /// Allow write operations (save_capture)
    #[arg(long, default_value_t = false)]
    allow_write: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();
    let cli = Cli::parse();

    let kb_path = if cli.kb.starts_with("~") {
        dirs::home_dir()
            .unwrap_or_default()
            .join(cli.kb.strip_prefix("~").unwrap())
    } else {
        cli.kb
    };

    info!("BrainOS MCP Server starting");
    info!("Knowledge base: {}", kb_path.display());
    info!("Write access: {}", cli.allow_write);

    // TODO: Initialize store, start JSON-RPC stdio loop
    eprintln!("BrainOS MCP Server — not yet implemented. KB: {}", kb_path.display());

    Ok(())
}
