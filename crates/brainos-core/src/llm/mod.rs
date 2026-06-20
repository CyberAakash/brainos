pub mod claude;
pub mod cli;
pub mod openai;
pub mod ollama;
pub mod gemini;

use anyhow::Result;
use serde::{Deserialize, Serialize};

use crate::config::ChatConfig;

/// A single message in the conversation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmMessage {
    pub role: String,   // "system", "user", "assistant"
    pub content: String,
}

/// Response from an LLM provider.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmResponse {
    pub text: String,
}

/// Send messages to the configured LLM provider and get a response.
pub async fn chat(config: &ChatConfig, messages: &[LlmMessage]) -> Result<LlmResponse> {
    let (name, provider) = config.active_provider();

    match name {
        "claude" | "anthropic" => claude::chat(&provider, messages).await,
        "claude-cli" => cli::chat(&provider, messages).await,
        "openai" | "gpt" => openai::chat(&provider, "https://api.openai.com/v1/chat/completions", messages).await,
        "gemini" => gemini::chat(&provider, messages).await,
        "deepseek" => openai::chat(&provider, "https://api.deepseek.com/v1/chat/completions", messages).await,
        "groq" => openai::chat(&provider, "https://api.groq.com/openai/v1/chat/completions", messages).await,
        "xai" => openai::chat(&provider, "https://api.x.ai/v1/chat/completions", messages).await,
        "ollama" | "local" => ollama::chat(&provider, messages).await,
        "custom" => match provider.api_mode.as_str() {
            "anthropic" => claude::chat(&provider, messages).await,
            _ => openai::chat(&provider, &provider.endpoint, messages).await,
        },
        other => anyhow::bail!("Unknown LLM provider: {other}"),
    }
}
