use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};

use crate::types::{LlmClient, LlmRequest, LlmResponse, Usage};

const DEFAULT_BASE_URL: &str = "https://api.openai.com/v1";

pub struct OpenAiClient {
    base_url: String,
    api_key: Option<String>,
}

impl OpenAiClient {
    pub fn new(base_url: Option<String>, api_key: Option<String>) -> Self {
        Self {
            base_url: base_url.unwrap_or_else(|| DEFAULT_BASE_URL.to_string()),
            api_key,
        }
    }

    fn build_body(&self, request: &LlmRequest) -> OpenAiRequest {
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

        let mut req = ureq::post(&url).header("Content-Type", "application/json");

        if let Some(key) = &self.api_key {
            req = req.header("Authorization", &format!("Bearer {}", key));
        }

        let mut resp = req
            .send(&json_body)
            .map_err(|e| anyhow::anyhow!("OpenAI-compatible API error: {}", e))?;

        let status = resp.status();
        let body_text = resp.body_mut().read_to_string()?;

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
struct OpenAiRequest {
    model: String,
    messages: Vec<OpenAiMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_p: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stop: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    seed: Option<u64>,
}

#[derive(Serialize, Deserialize)]
struct OpenAiMessage {
    role: String,
    content: String,
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{InferenceOptions, Message};

    #[test]
    fn build_body_includes_system_as_message() {
        let client = OpenAiClient::new(None, None);
        let req = LlmRequest {
            model: "gpt-4o".into(),
            messages: vec![Message {
                role: "user".into(),
                content: "hello".into(),
            }],
            system: Some("You are helpful.".into()),
            inference: InferenceOptions::default(),
        };

        let body = client.build_body(&req);
        assert_eq!(body.messages.len(), 2);
        assert_eq!(body.messages[0].role, "system");
        assert_eq!(body.messages[0].content, "You are helpful.");
        assert_eq!(body.messages[1].role, "user");
    }

    #[test]
    fn build_body_no_system() {
        let client = OpenAiClient::new(None, None);
        let req = LlmRequest {
            model: "gpt-4o".into(),
            messages: vec![Message {
                role: "user".into(),
                content: "hello".into(),
            }],
            system: None,
            inference: InferenceOptions::default(),
        };

        let body = client.build_body(&req);
        assert_eq!(body.messages.len(), 1);
        assert_eq!(body.messages[0].role, "user");
    }

    #[test]
    fn build_body_with_inference_options() {
        let client = OpenAiClient::new(None, None);
        let req = LlmRequest {
            model: "gpt-4o".into(),
            messages: vec![],
            system: None,
            inference: InferenceOptions {
                temperature: Some(0.5),
                top_p: Some(0.9),
                top_k: Some(40), // OpenAI doesn't support top_k — ignored
                max_tokens: Some(8192),
                stop: Some(vec!["STOP".into()]),
                seed: Some(42),
            },
        };

        let body = client.build_body(&req);
        assert_eq!(body.temperature, Some(0.5));
        assert_eq!(body.top_p, Some(0.9));
        assert_eq!(body.max_tokens, Some(8192));
        assert_eq!(body.seed, Some(42));
    }

    #[test]
    fn response_parsing() {
        let json = r#"{
            "choices": [{
                "message": {"role": "assistant", "content": "Hello!"},
                "finish_reason": "stop"
            }],
            "usage": {
                "prompt_tokens": 10,
                "completion_tokens": 5,
                "total_tokens": 15
            }
        }"#;

        let resp: OpenAiResponse = serde_json::from_str(json).unwrap();
        assert_eq!(resp.choices[0].message.content, "Hello!");
        assert_eq!(resp.usage.as_ref().unwrap().prompt_tokens, 10);
    }

    #[test]
    fn response_parsing_no_usage() {
        let json = r#"{
            "choices": [{
                "message": {"role": "assistant", "content": "Hi"},
                "finish_reason": "stop"
            }]
        }"#;

        let resp: OpenAiResponse = serde_json::from_str(json).unwrap();
        assert!(resp.usage.is_none());
    }

    #[test]
    fn ollama_config_no_api_key() {
        let client = OpenAiClient::new(
            Some("http://localhost:11434/v1".into()),
            None,
        );
        assert_eq!(client.base_url, "http://localhost:11434/v1");
        assert!(client.api_key.is_none());
    }

    #[test]
    fn default_base_url() {
        let client = OpenAiClient::new(None, Some("sk-test".into()));
        assert_eq!(client.base_url, "https://api.openai.com/v1");
    }
}
