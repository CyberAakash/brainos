use anyhow::{bail, Result};
use reqwest::Client;
use serde_json::{json, Value};

use crate::config::ProviderConfig;
use super::{LlmMessage, LlmResponse};

pub async fn chat(config: &ProviderConfig, messages: &[LlmMessage]) -> Result<LlmResponse> {
    let base_url = if config.endpoint.is_empty() {
        "http://localhost:11434"
    } else {
        &config.endpoint
    };

    let model = if config.model.is_empty() { "llama3.1" } else { &config.model };

    let msgs: Vec<Value> = messages.iter()
        .map(|m| json!({ "role": m.role, "content": m.content }))
        .collect();

    let body = json!({
        "model": model,
        "messages": msgs,
        "stream": false,
    });

    let url = format!("{}/api/chat", base_url.trim_end_matches('/'));

    let resp = Client::new()
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| anyhow::anyhow!(
            "Cannot connect to Ollama at {}. Is it running? Error: {}",
            base_url, e
        ))?;

    let status = resp.status();
    let resp_body: Value = resp.json().await?;

    if !status.is_success() {
        let err_msg = resp_body["error"]
            .as_str()
            .unwrap_or("Unknown Ollama error");
        bail!("Ollama error ({}): {}", status, err_msg);
    }

    let text = resp_body["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();

    Ok(LlmResponse { text })
}
