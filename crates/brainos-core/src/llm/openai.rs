use anyhow::{bail, Result};
use reqwest::Client;
use serde_json::{json, Value};

use crate::config::ProviderConfig;
use super::{LlmMessage, LlmResponse};

/// OpenAI-compatible chat. Reused by DeepSeek, Groq, xAI via custom `default_endpoint`.
pub async fn chat(
    config: &ProviderConfig,
    default_endpoint: &str,
    messages: &[LlmMessage],
) -> Result<LlmResponse> {
    if config.api_key.is_empty() {
        bail!("API key not configured. Go to Settings to add your API key.");
    }

    let msgs: Vec<Value> = messages.iter()
        .map(|m| json!({ "role": m.role, "content": m.content }))
        .collect();

    let model = if config.model.is_empty() { "gpt-4o" } else { &config.model };

    let body = json!({
        "model": model,
        "messages": msgs,
        "max_tokens": 4096,
    });

    let endpoint = if config.endpoint.is_empty() { default_endpoint } else { &config.endpoint };

    let resp = Client::new()
        .post(endpoint)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await?;

    let status = resp.status();
    let resp_body: Value = resp.json().await?;

    if !status.is_success() {
        let err_msg = resp_body["error"]["message"]
            .as_str()
            .unwrap_or("Unknown API error");
        bail!("API error ({}): {}", status, err_msg);
    }

    let text = resp_body["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();

    Ok(LlmResponse { text })
}
