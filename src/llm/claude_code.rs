use anyhow::{bail, Result};
use serde::Deserialize;

use crate::llm::{ProcessRunner, StdProcessRunner};
use crate::types::{LlmClient, LlmRequest, LlmResponse, Message, Usage};

/// LLM adapter that spawns the `claude` CLI binary as a subprocess.
/// Uses subscription-based authentication (no API key needed).
pub struct ClaudeCodeClient {
    model: String,
    runner: Box<dyn ProcessRunner>,
}

impl ClaudeCodeClient {
    pub fn new(model: String) -> Self {
        Self {
            model,
            runner: Box::new(StdProcessRunner),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_runner(model: String, runner: Box<dyn ProcessRunner>) -> Self {
        Self { model, runner }
    }
}

/// Build the CLI arguments for the `claude` binary.
/// System prompt is passed via `--system-prompt` flag to preserve
/// the semantic distinction from user/assistant messages.
// pub(crate) for test access from src/tests/
pub(crate) fn build_cli_args<'a>(model: &'a str, system: &'a Option<String>) -> Vec<&'a str> {
    let mut args = vec!["-p", "--output-format", "json", "--model", model];
    if let Some(sys) = system {
        args.extend(["--system-prompt", sys.as_str()]);
    }
    args
}

/// Build the stdin prompt from conversation messages only.
/// System prompt is NOT included here — it goes via --system-prompt flag.
// pub(crate) for test access from src/tests/
pub(crate) fn build_stdin_prompt(messages: &[Message]) -> String {
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

        let (exit_code, stdout, stderr) = self.runner.run("claude", &args, &prompt)?;

        if exit_code != 0 {
            bail!("claude binary exited with code {}: {}", exit_code, stderr);
        }

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
