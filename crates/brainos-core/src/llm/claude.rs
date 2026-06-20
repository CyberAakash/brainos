use anyhow::{bail, Result};
use reqwest::Client;
use serde_json::{json, Value};

use crate::config::ProviderConfig;
use super::{LlmMessage, LlmResponse};

const CLAUDE_API_URL: &str = "https://api.anthropic.com/v1/messages";

pub async fn chat(config: &ProviderConfig, messages: &[LlmMessage]) -> Result<LlmResponse> {
    if config.api_key.is_empty() {
        bail!("Claude API key not configured. Go to Settings to add your Anthropic API key.");
    }

    // Separate system message from conversation messages
    let system_text = messages.iter()
        .filter(|m| m.role == "system")
        .map(|m| m.content.as_str())
        .collect::<Vec<_>>()
        .join("\n\n");

    let conv_messages: Vec<Value> = messages.iter()
        .filter(|m| m.role != "system")
        .map(|m| json!({ "role": m.role, "content": m.content }))
        .collect();

    let model = if config.model.is_empty() { "claude-sonnet-4-6" } else { &config.model };

    let mut body = json!({
        "model": model,
        "max_tokens": 4096,
        "messages": conv_messages,
    });

    if !system_text.is_empty() {
        body["system"] = json!(system_text);
    }

    let endpoint = if config.endpoint.is_empty() { CLAUDE_API_URL } else { &config.endpoint };

    let resp = Client::new()
        .post(endpoint)
        .header("x-api-key", &config.api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await?;

    let status = resp.status();
    let resp_body: Value = resp.json().await?;

    if !status.is_success() {
        let err_msg = resp_body["error"]["message"]
            .as_str()
            .unwrap_or("Unknown API error");
        bail!("Claude API error ({}): {}", status, err_msg);
    }

    // Extract text from content blocks
    let text = resp_body["content"]
        .as_array()
        .and_then(|blocks| {
            blocks.iter()
                .filter_map(|b| {
                    if b["type"].as_str() == Some("text") {
                        b["text"].as_str().map(String::from)
                    } else {
                        None
                    }
                })
                .reduce(|a, b| format!("{a}\n{b}"))
        })
        .unwrap_or_default();

    Ok(LlmResponse { text })
}
