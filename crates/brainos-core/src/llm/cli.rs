use anyhow::{bail, Result};
use std::process::Command;

use crate::config::ProviderConfig;
use super::{LlmMessage, LlmResponse};

/// Uses the local `claude` CLI binary — no API key needed.
/// Requires Claude Code to be installed and authenticated via OAuth.
pub async fn chat(config: &ProviderConfig, messages: &[LlmMessage]) -> Result<LlmResponse> {
    let binary = if config.endpoint.is_empty() { "claude" } else { &config.endpoint };

    // Build prompt from messages: system context + history + user message
    let mut prompt_parts: Vec<String> = Vec::new();

    for msg in messages {
        match msg.role.as_str() {
            "system" => prompt_parts.push(format!("[System]\n{}", msg.content)),
            "user" => prompt_parts.push(format!("[User]\n{}", msg.content)),
            "assistant" => prompt_parts.push(format!("[Assistant]\n{}", msg.content)),
            _ => prompt_parts.push(msg.content.clone()),
        }
    }

    let full_prompt = prompt_parts.join("\n\n");

    // Build command: claude -p "prompt" --output-format text
    let mut cmd = Command::new(binary);
    cmd.arg("-p")
        .arg(&full_prompt)
        .arg("--output-format")
        .arg("text");

    // Set model if specified
    if !config.model.is_empty() {
        cmd.arg("--model").arg(&config.model);
    }

    // Run synchronously in a blocking task (Command::output is blocking)
    let output = tokio::task::spawn_blocking(move || cmd.output())
        .await
        .map_err(|e| anyhow::anyhow!("Task join error: {}", e))?
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                anyhow::anyhow!(
                    "Claude CLI not found at '{}'. Install Claude Code: npm install -g @anthropic-ai/claude-code",
                    binary
                )
            } else {
                anyhow::anyhow!("Failed to run Claude CLI: {}", e)
            }
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        bail!("Claude CLI error (exit {}): {}", output.status, stderr.trim());
    }

    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if text.is_empty() {
        bail!("Claude CLI returned empty response");
    }

    Ok(LlmResponse { text })
}

/// Check if the claude CLI binary is available on this system.
pub fn detect_cli(binary: &str) -> Option<String> {
    let bin = if binary.is_empty() { "claude" } else { binary };
    let output = Command::new(bin)
        .arg("--version")
        .output()
        .ok()?;

    if output.status.success() {
        let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Some(version)
    } else {
        None
    }
}
