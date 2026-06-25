use anyhow::Result;
use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::sync::Once;
use tracing::info;

pub struct Store {
    conn: Connection,
    #[allow(dead_code)]
    db_path: PathBuf,
}

/// Register sqlite-vec as an auto-extension. Called once per process.
fn init_sqlite_vec() {
    static INIT: Once = Once::new();
    INIT.call_once(|| {
        unsafe {
            rusqlite::ffi::sqlite3_auto_extension(Some(std::mem::transmute(
                sqlite_vec::sqlite3_vec_init as *const (),
            )));
        }
        info!("sqlite-vec extension registered");
    });
}

impl Store {
    pub fn open(data_dir: &Path) -> Result<Self> {
        init_sqlite_vec();
        std::fs::create_dir_all(data_dir)?;
        let db_path = data_dir.join("index.db");
        let conn = Connection::open(&db_path)?;

        // Enable WAL mode for better concurrent read performance
        conn.execute_batch("PRAGMA journal_mode=WAL;")?;
        conn.execute_batch("PRAGMA foreign_keys=ON;")?;
        // Allow concurrent access from MCP server + Tauri app
        conn.execute_batch("PRAGMA busy_timeout = 5000;")?;

        let store = Self { conn, db_path };
        store.run_migrations()?;
        Ok(store)
    }

    pub fn open_memory() -> Result<Self> {
        init_sqlite_vec();
        let conn = Connection::open_in_memory()?;
        conn.execute_batch("PRAGMA foreign_keys=ON;")?;
        let store = Self {
            conn,
            db_path: PathBuf::from(":memory:"),
        };
        store.run_migrations()?;
        Ok(store)
    }

    pub fn conn(&self) -> &Connection {
        &self.conn
    }

    fn run_migrations(&self) -> Result<()> {
        info!("Running database migrations...");

        // Check if FTS table needs rebuild:
        // 1) Old external-content table (has content=)
        // 2) Missing space/capture_type columns (old schema)
        let fts_sql: Option<String> = self.conn.query_row(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='captures_fts'",
            [],
            |row| row.get(0),
        ).ok();
        if let Some(ref sql) = fts_sql {
            let needs_rebuild = sql.contains("content=") || !sql.contains("capture_type");
            if needs_rebuild {
                info!("Dropping outdated FTS table for migration (rebuild with new columns)");
                self.conn.execute_batch("DROP TABLE IF EXISTS captures_fts;")?;
            }
        }

        self.conn.execute_batch(include_str!("migrations/001_init.sql"))?;

        // v2 migration: add new columns if they don't exist yet
        let has_summary: bool = self.conn
            .prepare("SELECT summary FROM captures LIMIT 0")
            .is_ok();
        if !has_summary {
            info!("Running v2 capture rework migration...");
            // Execute ALTER TABLEs one at a time (SQLite doesn't support multi-ALTER)
            let alter_stmts = [
                "ALTER TABLE captures ADD COLUMN summary TEXT",
                "ALTER TABLE captures ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'",
                "ALTER TABLE captures ADD COLUMN project_name TEXT",
                "ALTER TABLE captures ADD COLUMN project_path TEXT",
                "ALTER TABLE captures ADD COLUMN git_json TEXT",
                "ALTER TABLE captures ADD COLUMN chain_prev TEXT",
                "ALTER TABLE captures ADD COLUMN chain_refs_json TEXT",
                "ALTER TABLE captures ADD COLUMN links_json TEXT",
            ];
            for stmt in alter_stmts {
                self.conn.execute(stmt, []).ok(); // ok() — column may already exist
            }
            self.conn.execute_batch(
                "CREATE INDEX IF NOT EXISTS idx_captures_project_name ON captures(project_name);
                 CREATE INDEX IF NOT EXISTS idx_captures_chain_prev ON captures(chain_prev);
                 CREATE INDEX IF NOT EXISTS idx_captures_status ON captures(status);"
            )?;
            info!("v2 migration complete.");
        }

        // Rebuild FTS5 if it's missing the summary column
        if let Some(sql) = &fts_sql {
            if !sql.contains("summary") {
                info!("Rebuilding FTS table to add summary column...");
                self.conn.execute_batch("DROP TABLE IF EXISTS captures_fts;")?;
                self.conn.execute_batch(
                    "CREATE VIRTUAL TABLE IF NOT EXISTS captures_fts USING fts5(
                        id, title, summary, body_text, tags, space, capture_type,
                        tokenize='porter unicode61'
                    );"
                )?;
            }
        }

        // v2.1 migration: color & icon columns for captures
        {
            let has_color: bool = self.conn.prepare("SELECT color FROM captures LIMIT 0").is_ok();
            if !has_color {
                info!("Adding color & icon columns...");
                self.conn.execute("ALTER TABLE captures ADD COLUMN color TEXT", []).ok();
                self.conn.execute("ALTER TABLE captures ADD COLUMN icon TEXT", []).ok();
            }
        }

        // v3 migration: vector embeddings table (sqlite-vec)
        self.conn.execute_batch(include_str!("migrations/003_vectors.sql"))?;

        // v4 migration: entity graph tables
        self.conn.execute_batch(include_str!("migrations/004_entities.sql"))?;

        // v5 migration: contradiction detection
        self.conn.execute_batch(include_str!("migrations/005_contradictions.sql"))?;

        // v6 migration: workspace roots
        self.conn.execute_batch(include_str!("migrations/006_workspace_roots.sql"))?;
        {
            let has_root_id: bool = self.conn.prepare("SELECT root_id FROM captures LIMIT 0").is_ok();
            if !has_root_id {
                info!("Adding workspace root columns to captures...");
                // Note: REFERENCES clause omitted from ALTER TABLE because SQLite
                // requires DEFAULT NULL when foreign_keys=ON + REFERENCES.
                // FK integrity is enforced at the application layer instead.
                self.conn.execute("ALTER TABLE captures ADD COLUMN root_id INTEGER DEFAULT 0", []).ok();
                self.conn.execute("ALTER TABLE captures ADD COLUMN source_path TEXT", []).ok();
                self.conn.execute_batch(
                    "CREATE INDEX IF NOT EXISTS idx_captures_root_id ON captures(root_id);"
                )?;
            }
        }

        // v7 migration: workspace_files (metadata-only, no content)
        self.conn.execute_batch(include_str!("migrations/007_workspace_files.sql"))?;

        info!("Migrations complete.");
        Ok(())
    }
}
