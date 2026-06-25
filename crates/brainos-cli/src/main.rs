use anyhow::{Context, Result};
use chrono::{Datelike, NaiveDate, Utc};
use clap::{Parser, Subcommand};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use brainos_core::config::Config;
use brainos_core::models::CaptureFilters;

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
    /// Initialize BrainOS and register the MCP server
    Init {
        /// Path for the knowledge base (default: ~/knowledge-base)
        #[arg(long)]
        path: Option<PathBuf>,

        /// Register MCP server as read-only (no capture creation)
        #[arg(long)]
        read_only: bool,

        /// Skip registering in Claude Code settings
        #[arg(long)]
        no_claude: bool,

        /// Skip registering in Cursor settings
        #[arg(long)]
        no_cursor: bool,
    },
}

fn resolve_tilde(p: &Path) -> PathBuf {
    if p.starts_with("~") {
        dirs::home_dir()
            .unwrap_or_default()
            .join(p.strip_prefix("~").unwrap())
    } else {
        p.to_path_buf()
    }
}

/// Find the brainos-mcp binary. Check common locations.
fn find_mcp_binary() -> Option<PathBuf> {
    // 1. Check if it's next to this binary (same cargo target dir)
    if let Ok(self_path) = std::env::current_exe() {
        let sibling = self_path.parent().unwrap().join("brainos-mcp");
        if sibling.exists() {
            return Some(sibling);
        }
    }

    // 2. Check PATH via `which`
    if let Ok(output) = std::process::Command::new("which")
        .arg("brainos-mcp")
        .output()
    {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Some(PathBuf::from(path));
            }
        }
    }

    None
}

/// Find the capture.md slash command template.
/// Checks: sibling ../../../commands/capture.md (dev), then next to binary.
fn find_capture_command() -> Option<PathBuf> {
    // 1. Check relative to this binary's repo root (dev layout)
    if let Ok(self_path) = std::env::current_exe() {
        // binary is at target/debug/brainos — repo root is ../../..
        if let Some(target_dir) = self_path.parent() {
            // Walk up to find commands/capture.md
            for ancestor in [
                target_dir.join("../../../commands/capture.md"),
                target_dir.join("../../commands/capture.md"),
                target_dir.join("../commands/capture.md"),
            ] {
                if let Ok(canonical) = ancestor.canonicalize() {
                    if canonical.exists() {
                        return Some(canonical);
                    }
                }
            }
        }
    }

    // 2. Check current working directory
    let cwd_path = PathBuf::from("commands/capture.md");
    if cwd_path.exists() {
        return Some(cwd_path.canonicalize().unwrap_or(cwd_path));
    }

    None
}

/// Register brainos-mcp in a JSON config file under mcpServers.
/// Creates the file if it doesn't exist. Merges without overwriting other servers.
fn register_mcp_server(
    config_path: &Path,
    command: &str,
    args: &[&str],
) -> Result<bool> {
    // Read existing or start fresh
    let mut root: Value = if config_path.exists() {
        let content = std::fs::read_to_string(config_path)
            .with_context(|| format!("reading {}", config_path.display()))?;
        serde_json::from_str(&content)
            .with_context(|| format!("parsing {}", config_path.display()))?
    } else {
        json!({})
    };

    // Ensure mcpServers exists
    if root.get("mcpServers").is_none() {
        root.as_object_mut().unwrap().insert("mcpServers".into(), json!({}));
    }

    let servers = root["mcpServers"].as_object_mut().unwrap();

    // Check if brainos is already registered with same config
    let new_entry = json!({
        "command": command,
        "args": args,
    });

    if let Some(existing) = servers.get("brainos") {
        if existing == &new_entry {
            return Ok(false); // Already registered, no change
        }
    }

    servers.insert("brainos".into(), new_entry);

    // Write back
    if let Some(parent) = config_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let formatted = serde_json::to_string_pretty(&root)?;
    std::fs::write(config_path, formatted)
        .with_context(|| format!("writing {}", config_path.display()))?;

    Ok(true)
}

fn run_init(
    path: Option<PathBuf>,
    allow_write: bool,
    no_claude: bool,
    no_cursor: bool,
) -> Result<()> {
    let home = dirs::home_dir().context("cannot determine home directory")?;

    // ── 1. Resolve KB root ──────────────────────────────
    let kb_root = match path {
        Some(p) => resolve_tilde(&p),
        None => {
            let config = Config::load().unwrap_or_default();
            resolve_tilde(&config.general.kb_root)
        }
    };

    println!("Initializing BrainOS...\n");

    // ── 2. Create KB directory structure ─────────────────
    let spaces = ["projects", "learning", "daily", "reference"];
    let kb_existed = kb_root.exists();

    if !kb_existed {
        std::fs::create_dir_all(&kb_root)?;
        for space in &spaces {
            std::fs::create_dir_all(kb_root.join(space))?;
        }
        println!("  ✓ Created knowledge base: {}", kb_root.display());
    } else {
        // Ensure space dirs exist even if KB root already existed
        for space in &spaces {
            let dir = kb_root.join(space);
            if !dir.exists() {
                std::fs::create_dir_all(&dir)?;
            }
        }
        println!("  ✓ Knowledge base exists: {}", kb_root.display());
    }

    // ── 3. Create config if missing ─────────────────────
    let data_dir = Config::data_dir();
    let config_path = Config::config_path();

    if !config_path.exists() {
        let mut config = Config::default();
        config.general.kb_root = kb_root.clone();
        config.save()?;
        println!("  ✓ Created config: {}", config_path.display());
    } else {
        println!("  ✓ Config exists: {}", config_path.display());
    }

    // ── 4. Initialize store (creates SQLite DB) ─────────
    let db_path = data_dir.join("brainos.db");
    let db_existed = db_path.exists();
    let _store = brainos_core::Store::open(&data_dir)?;
    if !db_existed {
        println!("  ✓ Created database: {}", db_path.display());
    } else {
        println!("  ✓ Database exists: {}", db_path.display());
    }

    // ── 5. Find brainos-mcp binary ──────────────────────
    let mcp_binary = find_mcp_binary();
    let command = match &mcp_binary {
        Some(p) => p.to_string_lossy().to_string(),
        None => "brainos-mcp".to_string(), // Assume it'll be on PATH after install
    };

    let args: Vec<&str> = if allow_write {
        vec!["--allow-write"]
    } else {
        vec![]
    };

    if mcp_binary.is_none() {
        println!("\n  ⚠ brainos-mcp not found on PATH — using \"brainos-mcp\" as command.");
        println!("    Make sure it's installed: cargo install --path crates/brainos-mcp");
    }

    // ── 6. Install /capture slash command ─────────────
    println!();
    if !no_claude {
        let commands_dir = home.join(".claude").join("commands");
        let target = commands_dir.join("capture.md");
        // Find the command template — check relative to the binary first
        let source = find_capture_command();
        match source {
            Some(src) => {
                std::fs::create_dir_all(&commands_dir)?;
                let content = std::fs::read_to_string(&src)
                    .with_context(|| format!("reading {}", src.display()))?;
                // Only write if different (or missing)
                let needs_write = if target.exists() {
                    std::fs::read_to_string(&target).unwrap_or_default() != content
                } else {
                    true
                };
                if needs_write {
                    std::fs::write(&target, content)?;
                    println!("  ✓ Installed /capture command: {}", target.display());
                } else {
                    println!("  ✓ /capture command up to date");
                }
            }
            None => {
                println!("  ⚠ commands/capture.md not found — /capture slash command not installed");
            }
        }
    }

    // ── 7. Register in Claude Code ──────────────────────
    if !no_claude {
        let claude_settings = home.join(".claude").join("settings.json");
        match register_mcp_server(&claude_settings, &command, &args) {
            Ok(true) => println!("  ✓ Registered in Claude Code: {}", claude_settings.display()),
            Ok(false) => println!("  ✓ Already registered in Claude Code"),
            Err(e) => println!("  ✗ Claude Code registration failed: {e}"),
        }
    } else {
        println!("  – Skipped Claude Code registration (--no-claude)");
    }

    // ── 8. Register in Cursor ───────────────────────────
    if !no_cursor {
        // Cursor uses project-local .cursor/mcp.json
        // Write to cwd/.cursor/mcp.json
        let cursor_config = std::env::current_dir()
            .unwrap_or_else(|_| home.clone())
            .join(".cursor")
            .join("mcp.json");
        match register_mcp_server(&cursor_config, &command, &args) {
            Ok(true) => println!("  ✓ Registered in Cursor: {}", cursor_config.display()),
            Ok(false) => println!("  ✓ Already registered in Cursor"),
            Err(e) => println!("  ✗ Cursor registration failed: {e}"),
        }
    } else {
        println!("  – Skipped Cursor registration (--no-cursor)");
    }

    // ── 9. Summary ──────────────────────────────────────
    println!("\n  BrainOS is ready!\n");
    println!("  Knowledge base : {}", kb_root.display());
    println!("  Database       : {}", db_path.display());
    println!("  Config         : {}", config_path.display());
    println!("  Write access   : {}", allow_write);

    if mcp_binary.is_some() {
        println!("\n  The MCP server is registered. Restart Claude Code / Cursor to activate.");
    }

    Ok(())
}

// ── stats ──────────────────────────────────────────────────

fn run_stats(store: &brainos_core::Store) -> Result<()> {
    let all = store.list_captures(
        &CaptureFilters { include_archived: Some(true), ..Default::default() },
        100000, 0,
    )?;

    if all.is_empty() {
        println!("Knowledge base is empty. Create your first capture!");
        return Ok(());
    }

    let mut by_space: BTreeMap<String, u64> = BTreeMap::new();
    let mut by_type: BTreeMap<String, u64> = BTreeMap::new();
    let mut by_project: BTreeMap<String, u64> = BTreeMap::new();
    let mut tag_counts: BTreeMap<String, u64> = BTreeMap::new();

    let today = Utc::now().date_naive();
    let this_month_start = NaiveDate::from_ymd_opt(today.year(), today.month(), 1).unwrap_or(today);
    let mut this_month: u64 = 0;
    let mut earliest = today;
    let mut latest = NaiveDate::from_ymd_opt(2000, 1, 1).unwrap();

    for c in &all {
        *by_space.entry(c.space.to_string()).or_default() += 1;
        *by_type.entry(c.capture_type.clone()).or_default() += 1;
        for p in &c.projects { *by_project.entry(p.clone()).or_default() += 1; }
        for t in &c.tags { *tag_counts.entry(t.clone()).or_default() += 1; }
        if c.date >= this_month_start { this_month += 1; }
        if c.date < earliest { earliest = c.date; }
        if c.date > latest { latest = c.date; }
    }

    let mut top_tags: Vec<(String, u64)> = tag_counts.into_iter().collect();
    top_tags.sort_by(|a, b| b.1.cmp(&a.1));
    top_tags.truncate(10);

    println!("BrainOS Knowledge Base\n");
    println!("  Total captures : {}", all.len());
    println!("  This month     : {}", this_month);
    println!("  Date range     : {} → {}", earliest, latest);

    println!("\n  By space:");
    for (space, count) in &by_space {
        println!("    {:<12} {}", space, count);
    }

    println!("\n  By type:");
    let mut by_type_sorted: Vec<_> = by_type.into_iter().collect();
    by_type_sorted.sort_by(|a, b| b.1.cmp(&a.1));
    for (t, count) in &by_type_sorted {
        println!("    {:<24} {}", t, count);
    }

    if !by_project.is_empty() {
        println!("\n  By project:");
        let mut by_proj_sorted: Vec<_> = by_project.into_iter().collect();
        by_proj_sorted.sort_by(|a, b| b.1.cmp(&a.1));
        for (p, count) in by_proj_sorted.iter().take(15) {
            println!("    {:<24} {}", p, count);
        }
        if by_proj_sorted.len() > 15 {
            println!("    ... and {} more", by_proj_sorted.len() - 15);
        }
    }

    if !top_tags.is_empty() {
        println!("\n  Top tags:");
        for (tag, count) in &top_tags {
            println!("    {:<24} {}", tag, count);
        }
    }

    Ok(())
}

// ── reindex ────────────────────────────────────────────────

fn run_reindex(store: &brainos_core::Store, kb_root: &Path) -> Result<()> {
    println!("Re-indexing captures from {}...\n", kb_root.display());

    let count = brainos_core::indexing::indexer::index_all(store, kb_root, None)?;
    println!("  ✓ Indexed {} captures (without embeddings)", count);
    println!("\n  Tip: The Tauri app generates embeddings on startup for semantic search.");

    Ok(())
}

// ── lint ───────────────────────────────────────────────────

fn run_lint(store: &brainos_core::Store, kb_root: &Path) -> Result<()> {
    let all = store.list_captures(
        &CaptureFilters { include_archived: Some(true), ..Default::default() },
        100000, 0,
    )?;

    if all.is_empty() {
        println!("Nothing to lint — knowledge base is empty.");
        return Ok(());
    }

    println!("Linting {} captures...\n", all.len());
    let mut warnings = 0u32;
    let mut errors = 0u32;

    // Check each capture
    for c in &all {
        let mut issues: Vec<&str> = Vec::new();

        // Title checks
        let title_lower = c.title.to_lowercase();
        if c.title.len() < 10 {
            issues.push("title too short (< 10 chars)");
        }
        let generic_titles = ["bug fix", "learning", "update", "fix", "change", "note", "misc"];
        if generic_titles.iter().any(|g| title_lower == *g) {
            issues.push("title is generic — make it searchable");
        }

        // Tag checks
        if c.tags.is_empty() {
            issues.push("no tags");
        }

        // Summary check
        if c.summary.is_none() {
            issues.push("no summary");
        }

        // Project check (warning only)
        if c.projects.is_empty() {
            issues.push("no project assigned");
        }

        if !issues.is_empty() {
            warnings += issues.len() as u32;
            println!("  ⚠ {} ({})", c.id, c.title);
            for issue in &issues {
                println!("      - {}", issue);
            }
        }
    }

    // Check for files on disk without DB entries
    let files = brainos_core::files::list_files(kb_root)?;
    let db_paths: std::collections::HashSet<String> = all.iter()
        .map(|c| c.file_path.clone())
        .collect();
    for file in &files {
        if let Some(name) = file.file_name().and_then(|n| n.to_str()) {
            if !db_paths.contains(name) {
                errors += 1;
                println!("  ✗ Orphaned file (not indexed): {}", name);
            }
        }
    }

    // Check for DB entries whose files don't exist
    let captures_dir = kb_root.join("captures");
    for c in &all {
        let path = captures_dir.join(&c.file_path);
        if !path.exists() {
            errors += 1;
            println!("  ✗ Missing file for capture: {} ({})", c.id, c.file_path);
        }
    }

    // Check for duplicate titles
    let mut title_map: BTreeMap<String, Vec<&str>> = BTreeMap::new();
    for c in &all {
        title_map.entry(c.title.to_lowercase()).or_default().push(&c.id);
    }
    for (title, ids) in &title_map {
        if ids.len() > 1 {
            warnings += 1;
            println!("  ⚠ Duplicate title \"{}\": {}", title, ids.join(", "));
        }
    }

    println!();
    if errors == 0 && warnings == 0 {
        println!("  ✓ All {} captures look good!", all.len());
    } else {
        if errors > 0 { println!("  {} error(s)", errors); }
        if warnings > 0 { println!("  {} warning(s)", warnings); }
    }

    Ok(())
}

// ── sync ───────────────────────────────────────────────────

fn run_sync(kb_root: &Path, dry_run: bool, status_only: bool) -> Result<()> {
    // Check if kb_root is a git repo
    let git_dir = kb_root.join(".git");
    if !git_dir.exists() {
        println!("Knowledge base at {} is not a git repository.\n", kb_root.display());
        println!("To enable sync, initialize git in your KB:");
        println!("  cd {}", kb_root.display());
        println!("  git init");
        println!("  git remote add origin <your-repo-url>");
        return Ok(());
    }

    // git status
    let status_output = std::process::Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(kb_root)
        .output()
        .context("failed to run git status")?;

    let status_text = String::from_utf8_lossy(&status_output.stdout);
    let changes: Vec<&str> = status_text.lines().filter(|l| !l.is_empty()).collect();

    if status_only {
        if changes.is_empty() {
            println!("  ✓ Knowledge base is clean — nothing to sync.");
        } else {
            println!("  {} pending change(s):\n", changes.len());
            for line in &changes {
                println!("    {}", line);
            }
        }
        return Ok(());
    }

    if changes.is_empty() {
        println!("  ✓ Nothing to sync — knowledge base is clean.");
        return Ok(());
    }

    println!("  {} change(s) to sync:\n", changes.len());
    for line in &changes {
        println!("    {}", line);
    }

    if dry_run {
        println!("\n  (dry run — no changes made)");
        return Ok(());
    }

    // git add .
    let add = std::process::Command::new("git")
        .args(["add", "."])
        .current_dir(kb_root)
        .status()
        .context("failed to run git add")?;
    if !add.success() {
        anyhow::bail!("git add failed");
    }

    // git commit
    let today = Utc::now().format("%Y-%m-%d %H:%M");
    let msg = format!("brainos sync: {}", today);
    let commit = std::process::Command::new("git")
        .args(["commit", "-m", &msg])
        .current_dir(kb_root)
        .status()
        .context("failed to run git commit")?;
    if !commit.success() {
        anyhow::bail!("git commit failed");
    }
    println!("\n  ✓ Committed: {}", msg);

    // git push
    let push = std::process::Command::new("git")
        .args(["push"])
        .current_dir(kb_root)
        .status()
        .context("failed to run git push")?;
    if push.success() {
        println!("  ✓ Pushed to remote");
    } else {
        println!("  ⚠ Push failed — you may need to set up a remote or resolve conflicts");
    }

    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("brainos_core=warn".parse().unwrap())
                .add_directive("brainos_cli=info".parse().unwrap()),
        )
        .init();
    let cli = Cli::parse();

    match cli.command {
        Commands::Init {
            path,
            read_only,
            no_claude,
            no_cursor,
        } => {
            // Init doesn't need an existing config
            run_init(path, !read_only, no_claude, no_cursor)?;
        }
        _ => {
            // All other commands need the config + kb_root
            let config = Config::load()?;
            let kb_root = cli.kb.unwrap_or(config.general.kb_root.clone());
            let data_dir = Config::data_dir();
            let store = brainos_core::Store::open(&data_dir)?;

            match cli.command {
                Commands::Sync { dry_run, status } => {
                    run_sync(&kb_root, dry_run, status)?;
                }
                Commands::Reindex => {
                    run_reindex(&store, &kb_root)?;
                }
                Commands::Lint => {
                    run_lint(&store, &kb_root)?;
                }
                Commands::Stats => {
                    run_stats(&store)?;
                }
                Commands::Init { .. } => unreachable!(),
            }
        }
    }

    Ok(())
}
