use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub general: GeneralConfig,
    pub sync: SyncConfig,
    pub chat: ChatConfig,
    pub search: SearchConfig,
    pub ui: UiConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneralConfig {
    pub kb_root: PathBuf,
    pub display_name: String,
    #[serde(default = "default_true")]
    pub auto_index: bool,
    /// Additional workspace roots to index (code repos, project dirs)
    #[serde(default)]
    pub workspace_roots: Vec<WorkspaceRoot>,
}

fn default_true() -> bool { true }

/// A registered workspace root — a directory whose source files
/// get indexed into BrainOS for cross-workspace context.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceRoot {
    pub path: PathBuf,
    pub name: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// File extensions to index (e.g. ["rs", "ts"]). Empty = use default allowlist.
    #[serde(default)]
    pub file_types: Vec<String>,
    /// Directory names to exclude on top of .gitignore (e.g. ["vendor"]).
    #[serde(default)]
    pub exclude_dirs: Vec<String>,
}

impl WorkspaceRoot {
    /// Resolve ~ to home dir
    pub fn resolved_path(&self) -> PathBuf {
        if self.path.starts_with("~") {
            dirs::home_dir()
                .unwrap_or_default()
                .join(self.path.strip_prefix("~").unwrap())
        } else {
            self.path.clone()
        }
    }
}

/// Default file extensions to index from workspace roots.
pub const DEFAULT_SOURCE_EXTENSIONS: &[&str] = &[
    // Rust
    "rs",
    // JavaScript / TypeScript
    "ts", "tsx", "js", "jsx", "mjs", "mts",
    // JVM
    "java", "kt", "scala",
    // Python
    "py",
    // Go
    "go",
    // Systems
    "c", "cpp", "h", "hpp", "cs",
    // Web
    "html", "css", "scss", "vue", "svelte",
    // Data / Config
    "json", "yaml", "yml", "toml", "xml", "sql", "graphql", "proto",
    // Docs
    "md", "txt", "rst",
    // Shell
    "sh", "bash", "zsh",
    // Ruby / PHP / Swift
    "rb", "php", "swift",
];

/// Directories always excluded from workspace indexing (on top of .gitignore).
pub const ALWAYS_EXCLUDE_DIRS: &[&str] = &[
    "node_modules", "target", ".git", "dist", "build", ".next", ".nuxt",
    "__pycache__", ".gradle", ".idea", ".vscode", ".DS_Store", "vendor",
    "out", ".cache", "coverage", ".turbo", ".svn", ".hg", "bower_components",
    ".tox", ".mypy_cache", ".pytest_cache", "egg-info",
];

/// Max file size to index (100 KB). Larger files are skipped.
pub const MAX_SOURCE_FILE_SIZE: u64 = 100 * 1024;

/// Files larger than this get truncated to MAX_SOURCE_FILE_SIZE when indexing.
pub const TRUNCATE_THRESHOLD: u64 = 10 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncConfig {
    pub enabled: bool,
    pub remote_url: String,
    pub auth_method: String,
    pub schedule: String,
    pub auto_pull_on_launch: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatConfig {
    /// Which provider is currently active (e.g. "claude", "openai", "gemini", …)
    #[serde(default = "default_active")]
    pub active: String,
    /// Per-provider settings — each provider stores its own API key, model, endpoint
    #[serde(default = "default_providers")]
    pub providers: BTreeMap<String, ProviderConfig>,
}

fn default_active() -> String { "claude".into() }

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProviderConfig {
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub endpoint: String,
    /// For "custom" provider: "openai" or "anthropic" to pick the API format.
    #[serde(default)]
    pub api_mode: String,
}

fn default_providers() -> BTreeMap<String, ProviderConfig> {
    let mut m = BTreeMap::new();
    let p = |model: &str, endpoint: &str| ProviderConfig {
        model: model.into(),
        endpoint: endpoint.into(),
        ..Default::default()
    };
    m.insert("claude".into(), p("claude-sonnet-4-6", ""));
    m.insert("claude-cli".into(), p("claude-sonnet-4-6", ""));
    m.insert("openai".into(), p("gpt-4o", ""));
    m.insert("gemini".into(), p("gemini-2.5-flash", ""));
    m.insert("deepseek".into(), p("deepseek-chat", "https://api.deepseek.com/v1/chat/completions"));
    m.insert("groq".into(), p("llama-3.3-70b-versatile", "https://api.groq.com/openai/v1/chat/completions"));
    m.insert("xai".into(), p("grok-3-mini", "https://api.x.ai/v1/chat/completions"));
    m.insert("ollama".into(), p("llama3.1", "http://localhost:11434"));
    m.insert("custom".into(), ProviderConfig {
        api_mode: "openai".into(),
        ..Default::default()
    });
    m
}

impl ChatConfig {
    /// Get the active provider's config. Falls back to a default if not found.
    pub fn active_provider(&self) -> (&str, ProviderConfig) {
        let cfg = self.providers.get(&self.active).cloned().unwrap_or_default();
        (&self.active, cfg)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchConfig {
    pub embedding_model: String,
    pub rrf_k: u32,
    pub default_limit: u32,
    /// Half-life in days for temporal decay. Captures this many days old
    /// get 0.5× recency weight. Default 90.
    #[serde(default = "default_temporal_half_life")]
    pub temporal_half_life_days: u32,
}

fn default_temporal_half_life() -> u32 { 90 }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiConfig {
    pub theme: String,
    pub sidebar_width: u32,
    #[serde(default)]
    pub compact_mode: bool,
}

impl Default for Config {
    fn default() -> Self {
        let kb_root = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("knowledge-base");

        Self {
            general: GeneralConfig {
                kb_root,
                display_name: String::new(),
                auto_index: true,
                workspace_roots: Vec::new(),
            },
            sync: SyncConfig {
                enabled: false,
                remote_url: String::new(),
                auth_method: "ssh".into(),
                schedule: "0 8,22 * * *".into(),
                auto_pull_on_launch: true,
            },
            chat: ChatConfig {
                active: default_active(),
                providers: default_providers(),
            },
            search: SearchConfig {
                embedding_model: "BAAI/bge-small-en-v1.5".into(),
                rrf_k: 30,
                default_limit: 20,
                temporal_half_life_days: default_temporal_half_life(),
            },
            ui: UiConfig {
                theme: "system".into(),
                sidebar_width: 280,
                compact_mode: false,
            },
        }
    }
}

impl Config {
    pub fn data_dir() -> PathBuf {
        dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("brainos")
    }

    pub fn config_path() -> PathBuf {
        Self::data_dir().join("config.toml")
    }

    pub fn load() -> Result<Self> {
        let path = Self::config_path();
        if path.exists() {
            let content = std::fs::read_to_string(&path)?;
            let config: Config = toml::from_str(&content)?;
            Ok(config)
        } else {
            Ok(Config::default())
        }
    }

    pub fn save(&self) -> Result<()> {
        let path = Self::config_path();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let content = toml::to_string_pretty(self)?;
        std::fs::write(&path, content)?;
        Ok(())
    }
}
