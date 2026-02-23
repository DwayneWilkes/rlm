use std::io::Write;
use std::process::{Command, Stdio};

use anyhow::{bail, Result};
use serde::Deserialize;

use crate::types::{LlmClient, LlmRequest, LlmResponse, Usage};

/// LLM adapter that spawns the `claude` CLI binary as a subprocess.
/// Uses subscription-based authentication (no API key needed).
pub struct ClaudeCodeClient {
    model: String,
}

impl ClaudeCodeClient {
    pub fn new(model: String) -> Self {
        Self { model }
    }
}

impl LlmClient for ClaudeCodeClient {
    fn complete(&self, request: &LlmRequest) -> Result<LlmResponse> {
        // Build the prompt: system + messages concatenated
        let mut prompt = String::new();
        if let Some(sys) = &request.system {
            prompt.push_str(sys);
            prompt.push_str("\n\n");
        }
        for msg in &request.messages {
            if msg.role == "user" {
                prompt.push_str(&msg.content);
                prompt.push('\n');
            } else if msg.role == "assistant" {
                prompt.push_str(&format!("Assistant: {}\n", msg.content));
            }
        }

        // Spawn claude binary
        let mut child = Command::new("claude")
            .args(["-p", "--output-format", "json", "--model", &self.model])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| anyhow::anyhow!("Failed to spawn claude binary: {}. Is claude CLI installed?", e))?;

        // Send prompt via stdin
        if let Some(mut stdin) = child.stdin.take() {
            stdin.write_all(prompt.as_bytes())?;
            // stdin is dropped here, closing it
        }

        let output = child.wait_with_output()?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            bail!("claude binary exited with {}: {}", output.status, stderr);
        }

        let stdout = String::from_utf8(output.stdout)?;

        // Parse JSON output
        let cc_resp: ClaudeCodeResponse = serde_json::from_str(&stdout)
            .map_err(|e| anyhow::anyhow!("Failed to parse claude output: {}. Output: {}", e, &stdout[..stdout.len().min(200)]))?;

        Ok(LlmResponse {
            content: cc_resp.result,
            usage: Usage {
                input_tokens: cc_resp.input_tokens.unwrap_or(0),
                output_tokens: cc_resp.output_tokens.unwrap_or(0),
                cost_usd: cc_resp.cost_usd,
            },
        })
    }
}

/// Expected JSON output from `claude -p --output-format json`.
#[derive(Deserialize)]
struct ClaudeCodeResponse {
    result: String,
    #[serde(default)]
    input_tokens: Option<u64>,
    #[serde(default)]
    output_tokens: Option<u64>,
    #[serde(default)]
    cost_usd: Option<f64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_code_response_parsing() {
        let json = r#"{
            "result": "Hello world!",
            "input_tokens": 100,
            "output_tokens": 50,
            "cost_usd": 0.005
        }"#;
        let resp: ClaudeCodeResponse = serde_json::from_str(json).unwrap();
        assert_eq!(resp.result, "Hello world!");
        assert_eq!(resp.input_tokens, Some(100));
        assert_eq!(resp.output_tokens, Some(50));
    }

    #[test]
    fn claude_code_response_minimal() {
        let json = r#"{"result": "Hi"}"#;
        let resp: ClaudeCodeResponse = serde_json::from_str(json).unwrap();
        assert_eq!(resp.result, "Hi");
        assert!(resp.input_tokens.is_none());
        assert!(resp.output_tokens.is_none());
    }

    #[test]
    fn client_creation() {
        let client = ClaudeCodeClient::new("claude-sonnet-4-20250514".into());
        assert_eq!(client.model, "claude-sonnet-4-20250514");
    }
}
