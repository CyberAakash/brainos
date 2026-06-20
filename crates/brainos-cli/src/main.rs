use anyhow::Result;
use clap::{Parser, Subcommand};
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "brainos", about = "BrainOS CLI — manage your knowledge base")]
struct Cli {
    /// Path to knowledge base root
    #[arg(long, global = true)]
    kb: Option<PathBuf>,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Sync knowledge base to GitHub
    Sync {
        /// Show what would be committed without actually doing it
        #[arg(long)]
        dry_run: bool,

        /// Show pending changes
        #[arg(long)]
        status: bool,
    },
    /// Rebuild the search index from scratch
    Reindex,
    /// Run quality checks on captures
    Lint,
    /// Show knowledge base statistics
    Stats,
    /// Initialize a new knowledge base
    Init {
        /// Path for the new knowledge base
        #[arg(default_value = "~/brainos")]
        path: PathBuf,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();
    let cli = Cli::parse();

    let config = brainos_core::Config::load()?;
    let kb_root = cli.kb.unwrap_or(config.general.kb_root.clone());

    match cli.command {
        Commands::Sync { dry_run, status } => {
            println!("Sync not yet implemented (dry_run={dry_run}, status={status})");
        }
        Commands::Reindex => {
            println!("Reindex not yet implemented");
        }
        Commands::Lint => {
            println!("Lint not yet implemented");
        }
        Commands::Stats => {
            println!("Stats not yet implemented");
        }
        Commands::Init { path } => {
            let resolved = if path.starts_with("~") {
                dirs::home_dir().unwrap_or_default().join(path.strip_prefix("~").unwrap())
            } else {
                path
            };
            println!("Would initialize knowledge base at: {}", resolved.display());
        }
    }

    Ok(())
}
