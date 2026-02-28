use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};

use crate::llm::{HttpTransport, UreqTransport};
use crate::types::{LlmClient, LlmRequest, LlmResponse, Usage};

const DEFAULT_API_URL: &str = "https://api.anthropic.com/v1/messages";
const API_VERSION: &str = "2023-06-01";

pub struct AnthropicClient {
    api_key: String,
    api_url: String,
    http: Box<dyn HttpTransport>,
}

impl AnthropicClient {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            api_url: DEFAULT_API_URL.to_string(),
            http: Box::new(UreqTransport),
        }
    }

    pub fn with_url(mut self, url: String) -> Self {
        self.api_url = url;
        self
    }

    #[cfg(test)]
    pub(crate) fn with_transport(api_key: String, http: Box<dyn HttpTransport>) -> Self {
        Self {
            api_key,
            api_url: DEFAULT_API_URL.to_string(),
            http,
        }
    }

    /// Build the HTTP request body for the Anthropic API.
    // pub(crate) for test access from src/tests/
    pub(crate) fn build_body(&self, request: &LlmRequest) -> AnthropicRequest {
        let messages: Vec<AnthropicMessage> = request
            .messages
            .iter()
            .map(|m| AnthropicMessage {
                role: m.role.clone(),
                content: m.content.clone(),
            })
            .collect();

        let max_tokens = request.inference.max_tokens.unwrap_or(4096);

        AnthropicRequest {
            model: request.model.clone(),
            messages,
            system: request.system.clone(),
            max_tokens,
            temperature: request.inference.temperature,
            top_p: request.inference.top_p,
            top_k: request.inference.top_k,
            stop_sequences: request.inference.stop.clone(),
        }
    }
}

impl LlmClient for AnthropicClient {
    fn complete(&self, request: &LlmRequest) -> Result<LlmResponse> {
        let body = self.build_body(request);
        let json_body = serde_json::to_string(&body)?;

        let headers = [
            ("Content-Type", "application/json"),
            ("X-API-Key", self.api_key.as_str()),
            ("anthropic-version", API_VERSION),
        ];

        let (status, body_text) = self.http.post(&self.api_url, &headers, &json_body)?;

        if status != 200 {
            bail!("Anthropic API error (HTTP {}): {}", status, body_text);
        }

        let api_resp: AnthropicResponse = serde_json::from_str(&body_text)?;

        let content = api_resp
            .content
            .into_iter()
            .filter(|b| b.block_type == "text")
            .map(|b| b.text)
            .collect::<Vec<_>>()
            .join("");

        Ok(LlmResponse {
            content,
            usage: Usage {
                input_tokens: api_resp.usage.input_tokens,
                output_tokens: api_resp.usage.output_tokens,
                cost_usd: None, // caller can estimate based on model
            },
        })
    }
}

// ── Anthropic API types ──

#[derive(Serialize)]
pub(crate) struct AnthropicRequest {
    pub(crate) model: String,
    pub(crate) messages: Vec<AnthropicMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) system: Option<String>,
    pub(crate) max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) top_p: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) top_k: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) stop_sequences: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize)]
pub(crate) struct AnthropicMessage {
    pub(crate) role: String,
    pub(crate) content: String,
}

#[derive(Deserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicContentBlock>,
    usage: AnthropicUsage,
}

#[derive(Deserialize)]
struct AnthropicContentBlock {
    #[serde(rename = "type")]
    block_type: String,
    text: String,
}

#[derive(Deserialize)]
struct AnthropicUsage {
    input_tokens: u64,
    output_tokens: u64,
}
