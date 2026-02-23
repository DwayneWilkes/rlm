use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};

use crate::types::{LlmClient, LlmRequest, LlmResponse, Usage};

const DEFAULT_API_URL: &str = "https://api.anthropic.com/v1/messages";
const API_VERSION: &str = "2023-06-01";

pub struct AnthropicClient {
    api_key: String,
    api_url: String,
}

impl AnthropicClient {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            api_url: DEFAULT_API_URL.to_string(),
        }
    }

    pub fn with_url(mut self, url: String) -> Self {
        self.api_url = url;
        self
    }

    fn build_body(&self, request: &LlmRequest) -> AnthropicRequest {
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

        let mut resp = ureq::post(&self.api_url)
            .header("Content-Type", "application/json")
            .header("X-API-Key", &self.api_key)
            .header("anthropic-version", API_VERSION)
            .send(&json_body)
            .map_err(|e| anyhow::anyhow!("Anthropic API error: {}", e))?;

        let status = resp.status();
        let body_text = resp.body_mut().read_to_string()?;

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
struct AnthropicRequest {
    model: String,
    messages: Vec<AnthropicMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_p: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_k: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stop_sequences: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize)]
struct AnthropicMessage {
    role: String,
    content: String,
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{InferenceOptions, Message};

    #[test]
    fn build_body_maps_system_prompt() {
        let client = AnthropicClient::new("test-key".into());
        let req = LlmRequest {
            model: "claude-sonnet-4-20250514".into(),
            messages: vec![Message {
                role: "user".into(),
                content: "hello".into(),
            }],
            system: Some("You are helpful.".into()),
            inference: InferenceOptions::default(),
        };

        let body = client.build_body(&req);
        assert_eq!(body.system, Some("You are helpful.".to_string()));
        assert_eq!(body.messages.len(), 1);
        assert_eq!(body.messages[0].role, "user");
    }

    #[test]
    fn build_body_default_max_tokens() {
        let client = AnthropicClient::new("test-key".into());
        let req = LlmRequest {
            model: "test".into(),
            messages: vec![],
            system: None,
            inference: InferenceOptions::default(),
        };

        let body = client.build_body(&req);
        assert_eq!(body.max_tokens, 4096);
    }

    #[test]
    fn build_body_with_inference_options() {
        let client = AnthropicClient::new("test-key".into());
        let req = LlmRequest {
            model: "test".into(),
            messages: vec![],
            system: None,
            inference: InferenceOptions {
                temperature: Some(0.5),
                top_p: Some(0.9),
                top_k: Some(40),
                max_tokens: Some(8192),
                stop: Some(vec!["STOP".into()]),
                seed: Some(42), // Anthropic doesn't support seed, but we include it
            },
        };

        let body = client.build_body(&req);
        assert_eq!(body.temperature, Some(0.5));
        assert_eq!(body.top_p, Some(0.9));
        assert_eq!(body.top_k, Some(40));
        assert_eq!(body.max_tokens, 8192);
        assert_eq!(body.stop_sequences, Some(vec!["STOP".to_string()]));
    }

    #[test]
    fn response_parsing() {
        let json = r#"{
            "content": [
                {"type": "text", "text": "Hello "},
                {"type": "text", "text": "world!"}
            ],
            "usage": {
                "input_tokens": 10,
                "output_tokens": 5
            }
        }"#;

        let resp: AnthropicResponse = serde_json::from_str(json).unwrap();
        let content: String = resp
            .content
            .into_iter()
            .filter(|b| b.block_type == "text")
            .map(|b| b.text)
            .collect::<Vec<_>>()
            .join("");

        assert_eq!(content, "Hello world!");
        assert_eq!(resp.usage.input_tokens, 10);
        assert_eq!(resp.usage.output_tokens, 5);
    }

    #[test]
    fn custom_url() {
        let client = AnthropicClient::new("key".into())
            .with_url("http://localhost:8080/v1/messages".into());
        assert_eq!(client.api_url, "http://localhost:8080/v1/messages");
    }
}
