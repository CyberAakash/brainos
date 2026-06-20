//! Entity extraction engine — rule-based extraction from captures.
//!
//! Phase 2a: Extracts entities from structured frontmatter (high confidence)
//! and body text via regex patterns (medium confidence).

use crate::models::*;

/// Well-known technology names for classification.
/// Terms matching these are EntityType::Technology; others default to Concept.
const KNOWN_TECH: &[&str] = &[
    "rust", "python", "javascript", "typescript", "java", "go", "ruby", "swift",
    "kotlin", "c", "cpp", "csharp", "php", "scala", "elixir", "haskell", "lua",
    "react", "vue", "angular", "svelte", "next", "nuxt", "remix", "astro",
    "node", "deno", "bun", "express", "fastify", "actix", "axum", "rocket",
    "django", "flask", "fastapi", "rails", "spring", "laravel",
    "postgres", "postgresql", "mysql", "sqlite", "mongodb", "redis",
    "dynamodb", "cassandra", "elasticsearch", "meilisearch",
    "docker", "kubernetes", "k8s", "terraform", "ansible", "nginx", "caddy",
    "aws", "gcp", "azure", "vercel", "netlify", "cloudflare",
    "git", "github", "gitlab", "bitbucket",
    "graphql", "grpc", "rest", "websocket",
    "oauth", "oauth2", "jwt", "saml", "oidc",
    "linux", "macos", "windows", "wasm", "webassembly",
    "kafka", "rabbitmq", "nats", "sqs", "sns",
    "s3", "gcs", "blob",
    "tailwind", "css", "html", "sass", "less",
    "webpack", "vite", "esbuild", "rollup", "turbopack",
    "jest", "vitest", "pytest", "cargo", "npm", "yarn", "pnpm",
    "tauri", "electron", "flutter", "reactnative",
    "openai", "claude", "anthropic", "ollama", "llama", "gpt",
    "pytorch", "tensorflow", "onnx", "huggingface",
    "prometheus", "grafana", "datadog", "sentry",
    "stripe", "twilio", "sendgrid",
    "supabase", "firebase", "prisma", "drizzle",
    "qdrant", "pinecone", "chromadb", "weaviate", "milvus",
    "fts5", "sqlite-vec", "fastembed",
];

/// Extract all entities from a capture.
/// Returns a list of (Entity, MentionType, confidence) tuples.
pub fn extract_entities(capture: &Capture) -> Vec<EntityMention> {
    let mut mentions: Vec<EntityMention> = Vec::new();
    let date_str = capture.date.to_string();

    // ── 1. Frontmatter extraction (confidence 1.0) ──────────

    // Project name → Project entity
    if let Some(ref proj) = capture.project_info {
        push_entity(&mut mentions, &proj.name, EntityType::Project,
                     MentionType::Frontmatter, 1.0, &date_str);
    }

    // Tags → Technology or Concept
    for tag in &capture.tags {
        let etype = classify_tag(tag);
        push_entity(&mut mentions, tag, etype,
                     MentionType::Frontmatter, 1.0, &date_str);
    }

    // Links → Url entities
    for link in &capture.links {
        let label = link.label.as_deref().unwrap_or(&link.url);
        push_entity(&mut mentions, label, EntityType::Url,
                     MentionType::Frontmatter, 1.0, &date_str);
    }

    // Files → File entities
    for file in &capture.files {
        push_entity(&mut mentions, file, EntityType::File,
                     MentionType::Frontmatter, 1.0, &date_str);
    }

    // Repo → Project entity
    if let Some(ref repo) = capture.repo {
        push_entity(&mut mentions, repo, EntityType::Project,
                     MentionType::Frontmatter, 1.0, &date_str);
    }

    // Git repo remote → Project entity
    if let Some(ref git) = capture.git_info {
        if let Some(ref remote) = git.remote {
            // Extract repo name from remote URL
            if let Some(name) = repo_name_from_url(remote) {
                push_entity(&mut mentions, &name, EntityType::Project,
                            MentionType::Frontmatter, 0.9, &date_str);
            }
        }
    }

    // ── 2. Title extraction (confidence 0.9) ─────────────────

    extract_from_text(&capture.title, MentionType::Title, 0.9, &date_str, &mut mentions);

    // ── 3. Body text extraction (confidence 0.7) ─────────────

    // Limit body scanning to first ~5000 chars for performance
    let body = if capture.body_text.len() > 5000 {
        let mut end = 5000;
        while !capture.body_text.is_char_boundary(end) {
            end -= 1;
        }
        &capture.body_text[..end]
    } else {
        &capture.body_text
    };
    extract_from_text(body, MentionType::Body, 0.7, &date_str, &mut mentions);

    // Deduplicate: keep highest-confidence mention per entity ID
    dedup_mentions(&mut mentions);

    mentions
}

/// Extract entities from free text using regex patterns.
fn extract_from_text(
    text: &str,
    mention_type: MentionType,
    confidence: f64,
    date_str: &str,
    mentions: &mut Vec<EntityMention>,
) {
    // Backtick-quoted terms → Technology (e.g., `redis`, `OAuth2`)
    for cap in backtick_terms(text) {
        let trimmed = cap.trim();
        if trimmed.len() >= 2 && trimmed.len() <= 60 {
            let etype = classify_tag(trimmed);
            push_entity(mentions, trimmed, etype, mention_type.clone(), confidence, date_str);
        }
    }

    // CamelCase identifiers (e.g., AuthService, UserManager)
    for word in camel_case_terms(text) {
        if word.len() >= 4 && word.len() <= 50 {
            push_entity(mentions, &word, EntityType::Technology,
                        mention_type.clone(), confidence * 0.8, date_str);
        }
    }

    // Error patterns (E0505, ECONNREFUSED, HTTP 404/500)
    for err in error_patterns(text) {
        push_entity(mentions, &err, EntityType::Error,
                    mention_type.clone(), confidence, date_str);
    }

    // File paths (src/store/db.rs, ./config.toml)
    for path in file_path_patterns(text) {
        if path.len() >= 4 && path.len() <= 120 {
            push_entity(mentions, &path, EntityType::File,
                        mention_type.clone(), confidence * 0.9, date_str);
        }
    }
}

// ── Pattern matchers ────────────────────────────────────────

/// Extract backtick-quoted terms: `word` or `multi-word`
fn backtick_terms(text: &str) -> Vec<&str> {
    let mut results = Vec::new();
    let mut rest = text;
    while let Some(start) = rest.find('`') {
        let after = &rest[start + 1..];
        if let Some(end) = after.find('`') {
            let term = &after[..end];
            // Skip code blocks (``` or empty)
            if !term.is_empty() && !term.starts_with('`') && !term.contains('\n') {
                results.push(term);
            }
            rest = &after[end + 1..];
        } else {
            break;
        }
    }
    results
}

/// Find CamelCase identifiers (two+ uppercase transitions).
fn camel_case_terms(text: &str) -> Vec<String> {
    let mut results = Vec::new();
    for word in text.split(|c: char| c.is_whitespace() || c == '(' || c == ')' || c == ',') {
        let word = word.trim_matches(|c: char| !c.is_alphanumeric());
        if word.len() < 4 { continue; }
        // Must have at least one lowercase→uppercase transition
        let transitions = word.as_bytes().windows(2)
            .filter(|w| w[0].is_ascii_lowercase() && w[1].is_ascii_uppercase())
            .count();
        if transitions >= 1 && word.chars().next().map_or(false, |c| c.is_uppercase()) {
            // Skip ALL_CAPS words
            if word.chars().any(|c| c.is_lowercase()) {
                results.push(word.to_string());
            }
        }
    }
    results
}

/// Match error codes/patterns: E0505, ECONNREFUSED, HTTP 4xx/5xx
fn error_patterns(text: &str) -> Vec<String> {
    let mut results = Vec::new();
    for word in text.split_whitespace() {
        let clean = word.trim_matches(|c: char| !c.is_alphanumeric());
        // Rust-style errors: E0505, E0432
        if clean.starts_with('E') && clean.len() >= 4 && clean.len() <= 6
            && clean[1..].chars().all(|c| c.is_ascii_digit())
        {
            results.push(clean.to_string());
        }
        // POSIX-style: ECONNREFUSED, ENOENT
        if clean.starts_with('E') && clean.len() >= 5 && clean.len() <= 20
            && clean.chars().all(|c| c.is_ascii_uppercase())
        {
            results.push(clean.to_string());
        }
    }
    // HTTP status codes in context
    for window in text.as_bytes().windows(7) {
        let s = std::str::from_utf8(window).unwrap_or("");
        if (s.starts_with("404") || s.starts_with("500") || s.starts_with("503")
            || s.starts_with("401") || s.starts_with("403"))
            && s.len() >= 3
        {
            let code = &s[..3];
            if !results.contains(&code.to_string()) {
                results.push(code.to_string());
            }
        }
    }
    results
}

/// Match file paths: foo/bar.rs, ./config.toml, src/store/db.rs
fn file_path_patterns(text: &str) -> Vec<String> {
    let mut results = Vec::new();
    for word in text.split_whitespace() {
        let clean = word.trim_matches(|c: char| c == '\'' || c == '"' || c == '`' || c == '(' || c == ')' || c == ',');
        // Must contain / and a file extension or be a multi-segment path
        if clean.contains('/') && clean.len() >= 4 {
            let has_extension = clean.rsplit('/').next()
                .map(|f| f.contains('.'))
                .unwrap_or(false);
            let segments = clean.matches('/').count();
            if has_extension || segments >= 2 {
                // Skip URLs
                if !clean.starts_with("http") && !clean.starts_with("//") {
                    results.push(clean.to_string());
                }
            }
        }
    }
    results
}

// ── Helpers ─────────────────────────────────────────────────

/// Classify a tag/term as Technology or Concept based on known tech list.
fn classify_tag(tag: &str) -> EntityType {
    let lower = tag.to_lowercase();
    // Check against known tech names
    if KNOWN_TECH.iter().any(|t| *t == lower.as_str()) {
        return EntityType::Technology;
    }
    // Heuristic: if it looks like a language/framework suffix
    if lower.ends_with("js") || lower.ends_with("db") || lower.ends_with("sql")
        || lower.ends_with("ml") || lower.ends_with("api")
    {
        return EntityType::Technology;
    }
    EntityType::Concept
}

/// Extract repo name from a git remote URL.
/// "https://github.com/user/repo.git" → "repo"
/// "git@github.com:user/repo.git" → "repo"
fn repo_name_from_url(url: &str) -> Option<String> {
    let name = url.rsplit('/').next()
        .or_else(|| url.rsplit(':').next())?;
    let name = name.strip_suffix(".git").unwrap_or(name);
    if name.is_empty() { return None; }
    Some(name.to_string())
}

/// Normalize an entity name to a stable ID.
fn normalize_id(name: &str) -> String {
    name.to_lowercase()
        .trim()
        .replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_' && c != '/' && c != '.', "-")
        .to_string()
}

/// Push a new entity mention, constructing the Entity struct.
fn push_entity(
    mentions: &mut Vec<EntityMention>,
    name: &str,
    entity_type: EntityType,
    mention_type: MentionType,
    confidence: f64,
    date_str: &str,
) {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed.len() < 2 { return; }

    let id = normalize_id(trimmed);
    if id.is_empty() { return; }

    mentions.push(EntityMention {
        entity: Entity {
            id,
            display_name: trimmed.to_string(),
            entity_type,
            first_seen: date_str.to_string(),
            last_seen: date_str.to_string(),
            mention_count: 1,
        },
        mention_type,
        confidence,
    });
}

/// Deduplicate mentions by entity ID, keeping the highest confidence.
fn dedup_mentions(mentions: &mut Vec<EntityMention>) {
    // Sort by id, then by confidence descending
    mentions.sort_by(|a, b| {
        a.entity.id.cmp(&b.entity.id)
            .then(b.confidence.partial_cmp(&a.confidence).unwrap_or(std::cmp::Ordering::Equal))
    });
    mentions.dedup_by(|a, b| {
        if a.entity.id == b.entity.id {
            // Keep b (first occurrence = highest confidence after sort)
            true
        } else {
            false
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_backtick_terms() {
        let text = "Use `redis` for caching and `OAuth2` for auth";
        let terms = backtick_terms(text);
        assert_eq!(terms, vec!["redis", "OAuth2"]);
    }

    #[test]
    fn test_camel_case() {
        let terms = camel_case_terms("The AuthService calls UserManager");
        assert!(terms.contains(&"AuthService".to_string()));
        assert!(terms.contains(&"UserManager".to_string()));
    }

    #[test]
    fn test_classify_tag() {
        assert_eq!(classify_tag("rust"), EntityType::Technology);
        assert_eq!(classify_tag("Redis"), EntityType::Technology);
        assert_eq!(classify_tag("debugging"), EntityType::Concept);
    }

    #[test]
    fn test_normalize_id() {
        assert_eq!(normalize_id("Redis"), "redis");
        assert_eq!(normalize_id("auth-service"), "auth-service");
        assert_eq!(normalize_id("src/store/db.rs"), "src/store/db.rs");
    }

    #[test]
    fn test_repo_name() {
        assert_eq!(repo_name_from_url("https://github.com/user/brainos.git"), Some("brainos".into()));
        assert_eq!(repo_name_from_url("git@github.com:user/repo.git"), Some("repo".into()));
    }
}
