use anyhow::{bail, Result};
use reqwest::Client;
use serde_json::{json, Value};

use crate::config::ProviderConfig;
use super::{LlmMessage, LlmResponse};

pub async fn chat(config: &ProviderConfig, messages: &[LlmMessage]) -> Result<LlmResponse> {
    if config.api_key.is_empty() {
        bail!("Gemini API key not configured. Go to Settings to add your Google AI API key.");
    }

    let model = if config.model.is_empty() { "gemini-2.5-flash" } else { &config.model };

    // Gemini uses a different message format: parts with role mappings
    // system → systemInstruction, user/assistant → contents
    let system_text: String = messages.iter()
        .filter(|m| m.role == "system")
        .map(|m| m.content.as_str())
        .collect::<Vec<_>>()
        .join("\n\n");

    let contents: Vec<Value> = messages.iter()
        .filter(|m| m.role != "system")
        .map(|m| {
            let role = if m.role == "assistant" { "model" } else { "user" };
            json!({
                "role": role,
                "parts": [{ "text": &m.content }]
            })
        })
        .collect();

    let mut body = json!({ "contents": contents });

    if !system_text.is_empty() {
        body["systemInstruction"] = json!({
            "parts": [{ "text": system_text }]
        });
    }

    body["generationConfig"] = json!({ "maxOutputTokens": 4096 });

    let endpoint = if config.endpoint.is_empty() {
        format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
            model, config.api_key
        )
    } else {
        config.endpoint.clone()
    };

    let resp = Client::new()
        .post(&endpoint)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await?;

    let status = resp.status();
    let resp_body: Value = resp.json().await?;

    if !status.is_success() {
        let err_msg = resp_body["error"]["message"]
            .as_str()
            .unwrap_or("Unknown Gemini API error");
        bail!("Gemini API error ({}): {}", status, err_msg);
    }

    let text = resp_body["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .unwrap_or("")
        .to_string();

    Ok(LlmResponse { text })
}
