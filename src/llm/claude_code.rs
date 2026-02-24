use std::io::Write;
use std::process::{Command, Stdio};

use anyhow::{bail, Result};
use serde::Deserialize;

use crate::types::{LlmClient, LlmRequest, LlmResponse, Message, Usage};

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

/// Build the CLI arguments for the `claude` binary.
/// System prompt is passed via `--system-prompt` flag to preserve
/// the semantic distinction from user/assistant messages.
fn build_cli_args<'a>(model: &'a str, system: &'a Option<String>) -> Vec<&'a str> {
    let mut args = vec!["-p", "--output-format", "json", "--model", model];
    if let Some(sys) = system {
        args.extend(["--system-prompt", sys.as_str()]);
    }
    args
}

/// Build the stdin prompt from conversation messages only.
/// System prompt is NOT included here — it goes via --system-prompt flag.
fn build_stdin_prompt(messages: &[Message]) -> String {
    let mut prompt = String::new();
    for msg in messages {
        if msg.role == "user" {
            prompt.push_str(&msg.content);
            prompt.push('\n');
        } else if msg.role == "assistant" {
            prompt.push_str(&format!("Assistant: {}\n", msg.content));
        }
    }
    prompt
}

impl LlmClient for ClaudeCodeClient {
    fn complete(&self, request: &LlmRequest) -> Result<LlmResponse> {
        let args = build_cli_args(&self.model, &request.system);
        let prompt = build_stdin_prompt(&request.messages);

        // Spawn claude binary
        let mut child = Command::new("claude")
            .args(&args)
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

    #[test]
    fn cli_args_include_system_prompt_flag() {
        let system = Some("You are a helpful assistant.".to_string());
        let args = build_cli_args("test-model", &system);
        assert!(args.contains(&"--system-prompt"));
        assert!(args.contains(&"You are a helpful assistant."));
        assert!(args.contains(&"test-model"));
    }

    #[test]
    fn cli_args_no_system_prompt_when_none() {
        let args = build_cli_args("test-model", &None);
        assert!(!args.contains(&"--system-prompt"));
        assert_eq!(args.len(), 5); // -p, --output-format, json, --model, test-model
    }

    #[test]
    fn stdin_prompt_excludes_system() {
        let messages = vec![
            Message {
                role: "user".into(),
                content: "Hello".into(),
            },
        ];
        let prompt = build_stdin_prompt(&messages);
        assert_eq!(prompt, "Hello\n");
        // System prompt should NOT appear in stdin
        assert!(!prompt.contains("RLM"));
    }

    #[test]
    fn stdin_prompt_formats_conversation() {
        let messages = vec![
            Message {
                role: "user".into(),
                content: "What is 2+2?".into(),
            },
            Message {
                role: "assistant".into(),
                content: "```repl\nprint(2+2)\n```".into(),
            },
            Message {
                role: "user".into(),
                content: "4".into(),
            },
        ];
        let prompt = build_stdin_prompt(&messages);
        assert!(prompt.starts_with("What is 2+2?\n"));
        assert!(prompt.contains("Assistant: ```repl"));
        assert!(prompt.contains("4\n"));
    }
}
