# BrainOS Architecture Evolution — Three-Phase Plan

> **Decision**: Keep SQLite + FTS5 as foundation. Extend with sqlite-vec for vector search.
> **Rationale**: Single-file, local-first, zero-server. Hybrid BM25+vector beats either alone.
> **Validated by**: Google OKF (June 2026) uses the same markdown+YAML pattern we already have.

---

## Phase 1: Hybrid Search (sqlite-vec + fastembed-rs)

**Goal**: Add semantic vector search alongside existing BM25 keyword search, fused via Reciprocal Rank Fusion (RRF). Zero new processes, zero new files — vectors live in the same SQLite database.

**Why this matters**: BM25 misses conceptual matches ("authentication" won't find a capture about "OAuth token refresh"). Vector search misses exact terms. Together, they overlap only 40-55% — meaning each catches results the other misses entirely. Hybrid reduces RAG hallucinations from ~25% to ~9%.

### New Dependencies

```toml
# crates/brainos-core/Cargo.toml
[dependencies]
fastembed = "4"             # ONNX-based embeddings (wraps ort)
sqlite-vec = "0.1"          # Vector KNN for rusqlite
```

`fastembed` bundles ONNX Runtime and supports BGE-small-en-v1.5 out of the box. Model auto-downloads on first use (~67MB), cached in `$DATA_DIR/brainos/models/`.

`sqlite-vec` is a pure-C SQLite extension — loads via `rusqlite::Connection::load_extension` or statically linked.

### Files to Create

#### `crates/brainos-core/src/embedding.rs` — Embedding Engine

```
pub struct Embedder
  - model: fastembed::TextEmbedding (BGE-small-en-v1.5, 384 dims)
  - initialized lazily on first embed call
  
pub fn new(model_name: &str, cache_dir: &Path) -> Result<Self>
pub fn embed_documents(&self, texts: &[&str]) -> Result<Vec<Vec<f32>>>
pub fn embed_query(&self, query: &str) -> Result<Vec<f32>>
  - query uses "Represent this sentence for searching relevant passages: " prefix
  - documents use no prefix (BGE convention)
  
pub fn embed_capture(capture: &Capture) -> String
  - builds embedding input: "{title}\n{summary}\n{tags}\n{body_text truncated to 2000 chars}"
  - this is the TEXT we embed, not the vector itself
```

**Key design**: `Embedder` is `Send + Sync` so it can be shared across threads. Initialize once at app launch, wrap in `Arc<Embedder>`.

#### `crates/brainos-core/src/search/vector.rs` — Vector Search

```
pub fn search_vector(store: &Store, embedder: &Embedder, query: &str, limit: u32) -> Result<Vec<(String, f64)>>
  1. Embed query via embedder.embed_query(query)
  2. Query sqlite-vec: SELECT id, distance FROM capture_vectors WHERE embedding MATCH ? LIMIT ?
  3. Convert distance to similarity score (1.0 - distance for cosine)
  4. Return (id, score) pairs
```

#### `crates/brainos-core/src/search/hybrid.rs` — RRF Fusion

```
pub fn search_hybrid(store: &Store, embedder: &Embedder, query: &str, limit: u32, rrf_k: u32) -> Result<Vec<SearchResult>>
  1. Run BM25 search (existing search_fts)
  2. Run vector search (new search_vector)
  3. Fuse via RRF: score(doc) = SUM(1 / (k + rank_in_list))
     - rrf_k default = 30 (already in SearchConfig!)
  4. Sort by fused score descending
  5. Hydrate top-N into SearchResult with snippets
  6. Fallback: if embedder not initialized, return BM25-only results (graceful degradation)
```

### Files to Modify

#### `crates/brainos-core/src/store/migrations/003_vectors.sql` (new)

```sql
-- Vector storage table using sqlite-vec
CREATE VIRTUAL TABLE IF NOT EXISTS capture_vectors USING vec0(
    id TEXT PRIMARY KEY,
    embedding float[384]
);
```

#### `crates/brainos-core/src/store/db.rs`

- In `run_migrations()`: load sqlite-vec extension, then execute `003_vectors.sql`
- Add `load_sqlite_vec()` helper that calls `sqlite_vec::load(&conn)`

#### `crates/brainos-core/src/store/queries.rs`

- In `upsert_capture()`: ADD embedding step after FTS5 insert
  ```
  // After FTS5 insert, upsert vector embedding
  // This is done externally by the indexer since embedding requires &Embedder
  ```
  Actually — embeddings should NOT go in `upsert_capture` because `Embedder` is async-heavy.
  Instead: new method `upsert_embedding(id: &str, embedding: &[f32])` and `delete_embedding(id: &str)`.

- New methods on `Store`:
  ```rust
  pub fn upsert_embedding(&self, id: &str, embedding: &[f32]) -> Result<()>
  pub fn delete_embedding(&self, id: &str) -> Result<()>
  pub fn search_vec(&self, query_vec: &[f32], limit: u32) -> Result<Vec<(String, f64)>>
  pub fn has_embedding(&self, id: &str) -> bool
  ```

#### `crates/brainos-core/src/indexing/indexer.rs`

- `index_all()` signature changes: takes `&Embedder` parameter
- After `store.upsert_capture(&capture)`, call:
  ```rust
  let embed_text = embedding::embed_capture(&capture);
  let vector = embedder.embed_documents(&[&embed_text])?;
  store.upsert_embedding(&capture.id, &vector[0])?;
  ```
- Skip embedding if hash unchanged AND has embedding entry (like FTS check)

#### `crates/brainos-core/src/search/mod.rs`

```rust
pub mod bm25;
pub mod vector;
pub mod hybrid;

pub use bm25::search_bm25;
pub use hybrid::search_hybrid;
```

#### `crates/brainos-core/src/rag.rs`

- Change `build_context()` to accept `Option<&Embedder>`
- Replace `search_bm25(store, &request.message, RAG_SEARCH_LIMIT)` with:
  ```rust
  let search_results = match embedder {
      Some(emb) => search::search_hybrid(store, emb, &request.message, RAG_SEARCH_LIMIT, config.rrf_k)?,
      None => search::search_bm25(store, &request.message, RAG_SEARCH_LIMIT)?,
  };
  ```

#### `crates/brainos-core/src/lib.rs`

- Add `pub mod embedding;`

#### Frontend (TypeScript) — minimal changes

- Search IPC command already returns `SearchResult[]` — no change needed
- Settings: embedding model selector (future, not Phase 1)
- Status bar: show "Indexing embeddings..." during initial embed

### Execution Order

| Step | Task | Est. LOC |
|------|------|----------|
| 1 | Add `fastembed` + `sqlite-vec` to Cargo.toml, verify they compile | 5 |
| 2 | Write `003_vectors.sql` migration | 5 |
| 3 | Update `db.rs` — load sqlite-vec, run migration | 20 |
| 4 | Add `upsert_embedding`, `delete_embedding`, `search_vec`, `has_embedding` to queries.rs | 60 |
| 5 | Write `embedding.rs` — Embedder struct with lazy init | 80 |
| 6 | Write `search/vector.rs` — vector search function | 30 |
| 7 | Write `search/hybrid.rs` — RRF fusion | 60 |
| 8 | Update `search/mod.rs` — add new modules | 5 |
| 9 | Update `indexer.rs` — embed during index | 30 |
| 10 | Update `rag.rs` — use hybrid search | 20 |
| 11 | Update `lib.rs` — add embedding module | 1 |
| 12 | Thread `Embedder` through Tauri app state | 25 |
| 13 | Verify compilation + test with sample captures | — |

**Total**: ~340 LOC of new Rust code

### Performance Budget

| Operation | Target | Basis |
|-----------|--------|-------|
| Embed 1 document | <15ms | BGE-small CPU benchmark |
| Embed 10K documents (initial) | <150s | One-time batch at first launch |
| Vector search (10K docs) | <1ms | sqlite-vec brute-force 384d |
| BM25 search | <1ms | Current, unchanged |
| Hybrid search (total) | <20ms | embed query + vec search + BM25 + RRF fusion |
| Model download (first launch) | ~67MB | One-time, cached |
| Storage overhead per capture | ~1.5KB | 384 × 4 bytes = 1,536 bytes |

### Risk Mitigations

- **fastembed compile time**: ONNX Runtime is heavy. Use `fastembed/ort-download-binaries` feature to download prebuilt instead of compiling.
- **sqlite-vec static linking**: If `load_extension` fails on macOS (SIP), use the `sqlite-vec` crate's `rusqlite` feature for static linking.
- **Graceful degradation**: If embedder fails to init (no model downloaded, OOM), fall back to BM25-only. The system MUST work without vectors.
- **Incremental embedding**: Don't re-embed unchanged captures. Check `file_hash` + `has_embedding()`.

---

## Phase 2: Memory Graph (Entity Extraction + Linking)

**Goal**: Automatically extract entities (people, projects, technologies, concepts) from captures and link them into a graph. This enables "show me everything related to OAuth" without requiring the user to tag or link manually.

**Prerequisite**: Phase 1 complete (hybrid search working).

**Why this matters**: Tags are manual. Chains are linear. The real knowledge structure is a graph — a debugging capture about "Redis timeout in auth-service" connects to the "Redis" entity, the "auth-service" project, the "timeout" concept, and the person who reported it. mem0 proved this: entity-graph boosting is their third retrieval signal alongside BM25 and vector.

### Architecture Decision: LLM-based vs Rule-based Extraction

**Start with rule-based + NLP, NOT LLM-based.**

Reason: LLM extraction (like mem0's `add()`) requires an API call per capture. At 10K captures × $0.003/call = $30 just for initial indexing. And it's slow (~1s per capture). For a local-first app, this is unacceptable.

Instead:
1. **Rule-based entity extraction** from frontmatter (project names, tags, repos, file paths — already structured)
2. **NLP-based extraction** from body text (proper nouns, technology names, error codes) using a local model
3. **Optional LLM enhancement** when the user explicitly asks "analyze this capture deeper"

### New Dependencies

```toml
# None for Phase 2a (rule-based)
# Phase 2b (NLP): consider `rust-bert` or `candle` for local NER, but defer
```

### New Tables

#### `crates/brainos-core/src/store/migrations/004_entities.sql`

```sql
-- Entities are unique concepts/names extracted from captures
CREATE TABLE IF NOT EXISTS entities (
    id TEXT PRIMARY KEY,           -- normalized lowercase, e.g. "redis", "auth-service"
    display_name TEXT NOT NULL,    -- original casing, e.g. "Redis", "auth-service"
    entity_type TEXT NOT NULL,     -- person, project, technology, concept, error, file, url
    first_seen TEXT NOT NULL,      -- ISO date
    last_seen TEXT NOT NULL,       -- ISO date
    mention_count INTEGER DEFAULT 1
);

-- Junction: which captures mention which entities
CREATE TABLE IF NOT EXISTS capture_entities (
    capture_id TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    mention_type TEXT NOT NULL DEFAULT 'body',  -- frontmatter, body, title
    confidence REAL DEFAULT 1.0,                -- 1.0 for frontmatter, 0.5-0.9 for extracted
    PRIMARY KEY (capture_id, entity_id),
    FOREIGN KEY (capture_id) REFERENCES captures(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_capture_entities_entity ON capture_entities(entity_id);
```

### Files to Create

#### `crates/brainos-core/src/entities.rs` — Entity Extraction Engine

```
pub struct Entity {
    pub id: String,            // normalized
    pub display_name: String,
    pub entity_type: EntityType,
}

pub enum EntityType {
    Person, Project, Technology, Concept, Error, File, Url,
}

pub fn extract_entities(capture: &Capture) -> Vec<(Entity, MentionType, f64)>
  
  Phase 2a — Rule-based extraction:
  1. FROM FRONTMATTER (confidence 1.0):
     - capture.project_info.name → Project entity
     - capture.tags → Technology/Concept entities (heuristic: known tech list for Technology, rest Concept)
     - capture.links[].url → Url entities
     - capture.files[] → File entities
     - capture.repo → Project entity
  
  2. FROM BODY TEXT (confidence 0.7):
     - Regex: backtick-quoted terms (`redis`, `OAuth2`) → Technology
     - Regex: CamelCase words (AuthService, UserManager) → Technology/Concept
     - Regex: error patterns (E0505, ECONNREFUSED, 404, 500) → Error
     - Regex: file paths (src/store/db.rs) → File
     - Regex: URLs → Url
  
  3. NORMALIZATION:
     - entity.id = lowercase(display_name), strip common suffixes
     - "Redis", "redis", "REDIS" → entity_id "redis"
     - Merge close variants (future: edit distance < 2)
```

#### `crates/brainos-core/src/store/entity_queries.rs` — Entity CRUD

```
impl Store {
    pub fn upsert_entity(&self, entity: &Entity) -> Result<()>
    pub fn link_capture_entity(&self, capture_id: &str, entity_id: &str, mention_type: &str, confidence: f64) -> Result<()>
    pub fn unlink_capture_entities(&self, capture_id: &str) -> Result<()>
    pub fn get_entities_for_capture(&self, capture_id: &str) -> Result<Vec<Entity>>
    pub fn get_captures_for_entity(&self, entity_id: &str) -> Result<Vec<String>>
    pub fn get_related_entities(&self, entity_id: &str) -> Result<Vec<(Entity, u32)>>
      -- entities that co-occur in captures with this entity, ranked by co-occurrence count
    pub fn search_entities(&self, query: &str) -> Result<Vec<Entity>>
    pub fn get_entity_graph(&self, center_id: &str, depth: u32) -> Result<Vec<GraphEdge>>
}
```

### Files to Modify

#### `crates/brainos-core/src/indexing/indexer.rs`

After `upsert_capture` + `upsert_embedding`:
```rust
// Extract and link entities
store.unlink_capture_entities(&capture.id)?;
let entities = entities::extract_entities(&capture);
for (entity, mention_type, confidence) in &entities {
    store.upsert_entity(entity)?;
    store.link_capture_entity(&capture.id, &entity.id, &mention_type.to_string(), *confidence)?;
}
```

#### `crates/brainos-core/src/search/hybrid.rs`

Add entity boosting as third signal:
```rust
pub fn search_hybrid(...) -> Result<Vec<SearchResult>> {
    // 1. BM25 search
    // 2. Vector search
    // 3. Entity search (NEW):
    //    - Extract entities from query
    //    - Find captures sharing those entities
    //    - Add entity-match score to RRF fusion
    // 4. RRF fusion across all three ranked lists
}
```

#### `crates/brainos-core/src/models.rs`

- Add `Entity`, `EntityType`, `MentionType` structs (or put in entities.rs)
- Update `GraphEdge` — add `Entity` variant to `EdgeType`

#### Frontend (TypeScript)

- **ContextSidebar**: New "Entities" section showing extracted entities for current capture
- **DetailPanel**: Show entity chips (clickable → browse all captures with that entity)
- **Search**: Entity-aware suggestions ("redis" shows Redis entity with 12 captures)
- **New IPC commands**: `get_entities`, `get_captures_for_entity`, `search_entities`

### Execution Order

| Step | Task | Est. LOC |
|------|------|----------|
| 1 | Write `004_entities.sql` migration | 20 |
| 2 | Write `entities.rs` — rule-based extraction | 150 |
| 3 | Write `store/entity_queries.rs` | 120 |
| 4 | Update `db.rs` — run migration | 5 |
| 5 | Update `indexer.rs` — extract + link on index | 20 |
| 6 | Update `search/hybrid.rs` — entity boosting signal | 50 |
| 7 | Add Tauri IPC commands for entities | 40 |
| 8 | Frontend: entity chips in DetailPanel + ContextSidebar | 100 |
| 9 | Frontend: entity-aware search suggestions | 60 |
| 10 | Verify compilation + test entity extraction quality | — |

**Total**: ~565 LOC (Rust ~405, TypeScript ~160)

### Graph Visualization (Stretch Goal)

- D3.js force-directed graph showing entities as nodes, captures as connections
- Accessible from a "Knowledge Graph" view in the sidebar
- Click entity node → see all related captures
- This is a major differentiator for open-source marketing

---

## Phase 3: Smart Retrieval (Temporal, Decay, Contradiction)

**Goal**: Make BrainOS understand time, forgetting, and conflicting information. This is what separates a "search tool" from a "second brain" — and it's the startup differentiator no competitor has fully solved.

**Prerequisite**: Phase 2 complete (entity graph working).

### 3A: Temporal Ranking

**Problem**: "What's the current auth architecture?" should surface the latest capture, not the oldest one with the highest BM25 score.

**Solution**: Time-decay factor in search scoring.

#### Implementation

In `search/hybrid.rs`, add temporal weight:

```rust
fn temporal_score(capture_date: NaiveDate, now: NaiveDate) -> f64 {
    let days_ago = (now - capture_date).num_days().max(0) as f64;
    // Half-life of 90 days: captures from 90 days ago get 0.5x weight
    // Recent captures get ~1.0x, year-old captures get ~0.06x
    0.5_f64.powf(days_ago / 90.0)
}
```

Apply as a multiplier on the RRF fused score:
```rust
final_score = rrf_score * (0.7 + 0.3 * temporal_score)
// 70% base relevance + 30% recency boost
// This means old captures can still win if highly relevant
```

**Config**: Add `temporal_half_life_days: u32` to `SearchConfig` (default 90).

#### Files to Modify

- `search/hybrid.rs` — add temporal factor
- `config.rs` — add `temporal_half_life_days`
- `models.rs` — `SearchResult` gets `temporal_score: f64` field (for UI display)

### 3B: Smart Forgetting (Status-Aware Decay)

**Problem**: A capture saying "deploy meeting tomorrow at 3pm" from 6 months ago is noise. A capture about "Redis connection pooling pattern" from 6 months ago is still valuable.

**Solution**: Status-driven decay rules.

#### Implementation

New enum variants for `CaptureStatus`:
```rust
pub enum CaptureStatus {
    Draft,
    Active,
    Resolved,
    Archived,    // NEW: manually archived, excluded from search by default
    Expired,     // NEW: auto-expired by decay rules
}
```

Decay rules in a new `crates/brainos-core/src/decay.rs`:

```
pub struct DecayRule {
    pub capture_type: String,     // "meeting-note", "todo", "standup"
    pub max_age_days: u32,        // after this, auto-mark Expired
    pub condition: DecayCondition // Status must be Draft/Active (don't expire Resolved)
}

pub fn apply_decay_rules(store: &Store, rules: &[DecayRule]) -> Result<u32>
  - Runs periodically (on app launch + every 24h)
  - Marks matching captures as Expired
  - Returns count of expired captures
  
Default rules:
  - meeting-note, status=Draft, >180 days → Expired
  - standup, status=Draft, >30 days → Expired  
  - todo, status=Active, >90 days → flag for review (not auto-expire)
```

#### Search Integration

In `search/hybrid.rs`, filter out `Expired` captures by default:
```rust
// Unless the user explicitly searches with "include:expired"
if !query.contains("include:expired") {
    results.retain(|r| r.capture.status != CaptureStatus::Expired);
}
```

#### Files to Create/Modify

- `decay.rs` — decay engine (new, ~80 LOC)
- `models.rs` — add `Archived`, `Expired` status variants
- `config.rs` — add `decay_rules: Vec<DecayRule>` to config
- `search/hybrid.rs` — filter expired by default
- Frontend: "Expired" filter in BrowseView, "Review expired" notification

### 3C: Contradiction Detection

**Problem**: Capture A says "We use PostgreSQL for user data" but Capture B (newer) says "Migrated user data to DynamoDB." Which is current?

**Solution**: Entity-based contradiction detection using LLM (opt-in, not automatic).

#### Implementation

New `crates/brainos-core/src/contradiction.rs`:

```
pub struct Contradiction {
    pub capture_a: String,     // older capture ID
    pub capture_b: String,     // newer capture ID  
    pub entity: String,        // the entity they conflict on
    pub summary: String,       // LLM-generated description of the conflict
    pub resolution: Option<String>,  // user's resolution
}

pub async fn detect_contradictions(
    store: &Store,
    entity_id: &str, 
    chat_config: &ChatConfig
) -> Result<Vec<Contradiction>>
  1. Get all captures mentioning entity_id
  2. Sort by date
  3. Send pairs to LLM: "Do these two captures contradict each other about {entity}?"
  4. Return detected contradictions

pub fn get_unresolved_contradictions(store: &Store) -> Result<Vec<Contradiction>>
```

**This is opt-in**: User clicks "Check for conflicts" on an entity page, or runs it periodically via settings.

#### New Table

```sql
CREATE TABLE IF NOT EXISTS contradictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    capture_a TEXT NOT NULL,
    capture_b TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    summary TEXT NOT NULL,
    resolution TEXT,
    detected_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT,
    FOREIGN KEY (capture_a) REFERENCES captures(id) ON DELETE CASCADE,
    FOREIGN KEY (capture_b) REFERENCES captures(id) ON DELETE CASCADE
);
```

#### Search Integration

When a search hits a capture with unresolved contradictions, flag it:
```rust
pub struct SearchResult {
    pub capture: CaptureOverview,
    pub score: f64,
    pub snippet: String,
    pub has_contradictions: bool,   // NEW
    pub temporal_score: f64,         // NEW (from 3A)
}
```

Frontend shows a warning badge on contradicted captures.

### 3D: Query Understanding (Stretch Goal)

**Problem**: User asks "what did I learn about auth last week?" — this needs temporal parsing + entity matching + semantic search combined.

**Solution**: Pre-process queries to extract intent:

```rust
pub struct ParsedQuery {
    pub raw: String,
    pub entities: Vec<String>,        // extracted entity mentions
    pub time_range: Option<(NaiveDate, NaiveDate)>,  // "last week" → date range
    pub intent: QueryIntent,          // Search, Recall, Compare, Summarize
}

pub enum QueryIntent {
    Search,       // find captures matching X
    Recall,       // "what did I..." — recent + personal
    Compare,      // "difference between X and Y"
    Summarize,    // "summarize everything about X"
    CurrentState, // "what's the current..." — latest + resolved state
}
```

This feeds into the RAG pipeline to adjust search weights and system prompt.

### Execution Order

| Step | Task | Est. LOC |
|------|------|----------|
| 1 | 3A: Temporal ranking in hybrid search | 30 |
| 2 | 3A: Config additions | 10 |
| 3 | 3B: Add Archived/Expired status variants | 20 |
| 4 | 3B: Write decay.rs — rules engine | 80 |
| 5 | 3B: Filter expired from search | 15 |
| 6 | 3B: Run decay on app launch | 10 |
| 7 | 3C: Contradiction table migration | 15 |
| 8 | 3C: Write contradiction.rs | 100 |
| 9 | 3C: Frontend contradiction badges | 40 |
| 10 | 3D: Query understanding (stretch) | 120 |
| 11 | Verify all phases integrate | — |

**Total**: ~440 LOC (core ~280, frontend ~120, stretch ~120)

---

## Summary

| Phase | What | New Deps | New LOC | Key Metric |
|-------|------|----------|---------|------------|
| 1 | Hybrid Search | fastembed, sqlite-vec | ~340 | Search latency <20ms |
| 2 | Memory Graph | None | ~565 | Auto-extracted entities |
| 3 | Smart Retrieval | None | ~440 | Time-aware + contradiction detection |

**Total new code**: ~1,345 LOC across all phases.

**What stays the same**: Markdown files as source of truth, SQLite as the single index file, FTS5 for keyword search, existing CRUD, existing chat/RAG pipeline. Everything is additive — nothing gets replaced.

**Startup positioning after all 3 phases**: "The local-first second brain that actually understands your knowledge graph, forgets what's stale, and catches when your notes contradict each other. Single file. No cloud. Your data stays yours."
