use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};

use crate::llm::{HttpTransport, UreqTransport};
use crate::types::{LlmClient, LlmRequest, LlmResponse, Usage};

const DEFAULT_BASE_URL: &str = "https://api.openai.com/v1";

pub struct OpenAiClient {
    base_url: String,
    api_key: Option<String>,
    http: Box<dyn HttpTransport>,
}

impl OpenAiClient {
    pub fn new(base_url: Option<String>, api_key: Option<String>) -> Self {
        Self {
            base_url: base_url.unwrap_or_else(|| DEFAULT_BASE_URL.to_string()),
            api_key,
            http: Box::new(UreqTransport),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_transport(
        base_url: Option<String>,
        api_key: Option<String>,
        http: Box<dyn HttpTransport>,
    ) -> Self {
        Self {
            base_url: base_url.unwrap_or_else(|| DEFAULT_BASE_URL.to_string()),
            api_key,
            http,
        }
    }

    /// Build the HTTP request body for the OpenAI-compatible API.
    // pub(crate) for test access from src/tests/
    pub(crate) fn build_body(&self, request: &LlmRequest) -> OpenAiRequest {
        let mut messages = Vec::new();

        // System prompt as a system message
        if let Some(sys) = &request.system {
            messages.push(OpenAiMessage {
                role: "system".into(),
                content: sys.clone(),
            });
        }

        // User/assistant messages
        for m in &request.messages {
            messages.push(OpenAiMessage {
                role: m.role.clone(),
                content: m.content.clone(),
            });
        }

        OpenAiRequest {
            model: request.model.clone(),
            messages,
            max_tokens: request.inference.max_tokens,
            temperature: request.inference.temperature,
            top_p: request.inference.top_p,
            stop: request.inference.stop.clone(),
            seed: request.inference.seed,
        }
    }
}

impl LlmClient for OpenAiClient {
    fn complete(&self, request: &LlmRequest) -> Result<LlmResponse> {
        let url = format!("{}/chat/completions", self.base_url.trim_end_matches('/'));
        let body = self.build_body(request);
        let json_body = serde_json::to_string(&body)?;

        let mut headers: Vec<(&str, &str)> = vec![("Content-Type", "application/json")];

        // We need to hold the formatted string so the borrow lives long enough
        let auth_header;
        if let Some(key) = &self.api_key {
            auth_header = format!("Bearer {}", key);
            headers.push(("Authorization", &auth_header));
        }

        let (status, body_text) = self.http.post(&url, &headers, &json_body)?;

        if status != 200 {
            bail!(
                "OpenAI-compatible API error (HTTP {}): {}",
                status,
                body_text
            );
        }

        let api_resp: OpenAiResponse = serde_json::from_str(&body_text)?;

        let content = api_resp
            .choices
            .into_iter()
            .next()
            .map(|c| c.message.content)
            .unwrap_or_default();

        let usage = api_resp.usage.map_or(Usage::default(), |u| Usage {
            input_tokens: u.prompt_tokens,
            output_tokens: u.completion_tokens,
            cost_usd: None,
        });

        Ok(LlmResponse { content, usage })
    }
}

// ── OpenAI API types ──

#[derive(Serialize)]
pub(crate) struct OpenAiRequest {
    pub(crate) model: String,
    pub(crate) messages: Vec<OpenAiMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) top_p: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) stop: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) seed: Option<u64>,
}

#[derive(Serialize, Deserialize)]
pub(crate) struct OpenAiMessage {
    pub(crate) role: String,
    pub(crate) content: String,
}

#[derive(Deserialize)]
struct OpenAiResponse {
    choices: Vec<OpenAiChoice>,
    usage: Option<OpenAiUsage>,
}

#[derive(Deserialize)]
struct OpenAiChoice {
    message: OpenAiMessage,
}

#[derive(Deserialize)]
struct OpenAiUsage {
    prompt_tokens: u64,
    completion_tokens: u64,
}
