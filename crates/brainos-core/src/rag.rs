use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

use crate::config::ChatConfig;
use crate::embedding::Embedder;
use crate::llm::{self, LlmMessage};
use crate::models::Capture;
use crate::store::Store;

/// Input for a RAG chat turn.
#[derive(Debug, Clone, Deserialize)]
pub struct ChatRequest {
    pub message: String,
    pub pinned_ids: Vec<String>,
    pub history: Vec<ChatHistoryItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatHistoryItem {
    pub role: String,   // "user" or "assistant"
    pub content: String,
}

/// Metadata for a source capture referenced in a chat response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceRef {
    pub id: String,
    pub title: String,
    pub space: String,
    pub capture_type: String,
    pub tags: Vec<String>,
}

/// Output from a RAG chat turn.
#[derive(Debug, Clone, Serialize)]
pub struct ChatResponse {
    pub text: String,
    pub source_ids: Vec<String>,
    pub sources: Vec<SourceRef>,
}

/// Intermediate result from context building (sync, needs Store).
pub struct RagContext {
    pub messages: Vec<LlmMessage>,
    pub source_ids: Vec<String>,
    pub sources: Vec<SourceRef>,
}

const MAX_CONTEXT_CHARS: usize = 12_000;
const RAG_SEARCH_LIMIT: u32 = 5;
const MAX_CHAIN_DEPTH: usize = 3;

/// Phase 1 (sync): Search the KB and build the LLM prompt with context.
/// This borrows &Store so it can be called while holding a MutexGuard.
/// If an Embedder is provided, uses hybrid search (BM25 + vector + RRF).
/// Otherwise falls back to BM25-only keyword search.
pub fn build_context(store: &Store, request: &ChatRequest, embedder: Option<&Embedder>) -> Result<RagContext> {
    let mut source_ids: Vec<String> = Vec::new();
    let mut sources: Vec<SourceRef> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let mut context_parts: Vec<String> = Vec::new();
    let mut total_chars: usize = 0;

    // Helper: add a capture to context (with optional chain walk)
    let add_capture = |capture: &Capture, seen: &mut HashSet<String>, source_ids: &mut Vec<String>, sources: &mut Vec<SourceRef>, context_parts: &mut Vec<String>, total_chars: &mut usize| {
        let block = format_capture_context(capture);
        if *total_chars + block.len() > MAX_CONTEXT_CHARS { return false; }
        *total_chars += block.len();
        context_parts.push(block);
        source_ids.push(capture.id.clone());
        sources.push(SourceRef {
            id: capture.id.clone(),
            title: capture.title.clone(),
            space: capture.space.to_string(),
            capture_type: capture.capture_type.clone(),
            tags: capture.tags.clone(),
        });
        seen.insert(capture.id.clone());
        true
    };

    // 1. Load pinned captures (explicit context) + walk their chains
    for id in &request.pinned_ids {
        if seen.contains(id) { continue; }
        if let Some(capture) = store.get_capture(id)? {
            if !add_capture(&capture, &mut seen, &mut source_ids, &mut sources, &mut context_parts, &mut total_chars) { break; }
            // Walk chain backwards
            walk_chain(store, &capture, MAX_CHAIN_DEPTH, &mut seen, &mut source_ids, &mut sources, &mut context_parts, &mut total_chars);
        }
    }

    // 2. Search KB for relevant captures + walk their chains
    // Use hybrid search (BM25 + vector + RRF) when embedder is available
    let search_results = crate::search::search_hybrid(store, embedder, &request.message, RAG_SEARCH_LIMIT, None, None)?;
    for sr in &search_results {
        let id = &sr.capture.id;
        if seen.contains(id) { continue; }
        if let Some(capture) = store.get_capture(id)? {
            if !add_capture(&capture, &mut seen, &mut source_ids, &mut sources, &mut context_parts, &mut total_chars) { break; }
            walk_chain(store, &capture, MAX_CHAIN_DEPTH, &mut seen, &mut source_ids, &mut sources, &mut context_parts, &mut total_chars);
        }
    }

    // 3. Build messages
    let system_prompt = build_system_prompt(&context_parts);

    let mut messages: Vec<LlmMessage> = vec![
        LlmMessage { role: "system".into(), content: system_prompt },
    ];

    // Add conversation history (last 10 turns max)
    let history_start = request.history.len().saturating_sub(10);
    for item in &request.history[history_start..] {
        messages.push(LlmMessage {
            role: item.role.clone(),
            content: item.content.clone(),
        });
    }

    // Add current user message
    messages.push(LlmMessage {
        role: "user".into(),
        content: request.message.clone(),
    });

    Ok(RagContext { messages, source_ids, sources })
}

/// Walk chain.prev backwards up to `depth` captures, adding each as context.
fn walk_chain(
    store: &Store,
    capture: &Capture,
    depth: usize,
    seen: &mut HashSet<String>,
    source_ids: &mut Vec<String>,
    sources: &mut Vec<SourceRef>,
    context_parts: &mut Vec<String>,
    total_chars: &mut usize,
) {
    let mut current = capture.chain.as_ref().and_then(|c| c.prev.clone());
    let mut remaining = depth;

    while let Some(prev_id) = current {
        if remaining == 0 || seen.contains(&prev_id) { break; }
        remaining -= 1;

        match store.get_capture(&prev_id) {
            Ok(Some(prev_capture)) => {
                let block = format_capture_context(&prev_capture);
                if *total_chars + block.len() > MAX_CONTEXT_CHARS { break; }
                *total_chars += block.len();
                context_parts.push(block);
                source_ids.push(prev_capture.id.clone());
                sources.push(SourceRef {
                    id: prev_capture.id.clone(),
                    title: prev_capture.title.clone(),
                    space: prev_capture.space.to_string(),
                    capture_type: prev_capture.capture_type.clone(),
                    tags: prev_capture.tags.clone(),
                });
                seen.insert(prev_capture.id.clone());
                current = prev_capture.chain.as_ref().and_then(|c| c.prev.clone());
            }
            _ => break,
        }
    }
}

/// Phase 2 (async): Send the prepared messages to the LLM.
/// Does NOT hold any mutex — safe to .await.
pub async fn call_llm(config: &ChatConfig, context: RagContext) -> Result<ChatResponse> {
    let response = llm::chat(config, &context.messages).await?;

    Ok(ChatResponse {
        text: response.text,
        source_ids: context.source_ids,
        sources: context.sources,
    })
}

fn build_system_prompt(context_parts: &[String]) -> String {
    let mut prompt = String::from(
        "You are BrainOS, a helpful AI assistant for a developer's personal knowledge base. \
         You help the user recall, connect, and reason about their captured knowledge — debugging notes, \
         architecture decisions, learning summaries, code patterns, and more.\n\n\
         Be concise, accurate, and reference specific captures when relevant. \
         If the user's question can be answered from the provided context, use it. \
         If not, say so honestly rather than making things up.\n"
    );

    if !context_parts.is_empty() {
        prompt.push_str("\n---\n\n## Knowledge Base Context\n\n");
        prompt.push_str("The following captures from the user's knowledge base are relevant:\n\n");
        for (i, part) in context_parts.iter().enumerate() {
            prompt.push_str(&format!("### Source {}\n{}\n\n", i + 1, part));
        }
        prompt.push_str("---\n\nUse the above context to answer the user's question. \
                         When citing information from a source, use numbered references like [1], [2], etc. \
                         matching the source numbers above. You may cite multiple sources in a single statement [1][3]. \
                         Only cite sources you actually use.\n");
    }

    prompt
}

/// Format a capture for LLM context, using summary when available.
fn format_capture_context(capture: &Capture) -> String {
    let tags_str = if capture.tags.is_empty() {
        String::new()
    } else {
        format!(" [{}]", capture.tags.join(", "))
    };

    let mut header = format!("**{}** ({}){}", capture.title, capture.capture_type, tags_str);

    // Add project + status context
    if let Some(ref pi) = capture.project_info {
        header.push_str(&format!(" — project: {}", pi.name));
    }
    if capture.status == crate::models::CaptureStatus::Archived {
        header.push_str(" [archived]");
    }

    // Summary line (if available, shown before body for quick orientation)
    let summary_line = match &capture.summary {
        Some(s) if !s.is_empty() => format!("\n*{}*\n", s),
        _ => String::new(),
    };

    // Truncate body to ~2000 chars per capture
    let body_truncated = if capture.body_text.len() > 2000 {
        let end = capture.body_text.char_indices()
            .take_while(|(i, _)| *i < 2000)
            .last()
            .map(|(i, c)| i + c.len_utf8())
            .unwrap_or(2000);
        format!("{}…", &capture.body_text[..end])
    } else {
        capture.body_text.clone()
    };

    format!("{}{}\n{}", header, summary_line, body_truncated)
}
