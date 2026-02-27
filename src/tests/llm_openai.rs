use crate::llm::openai::OpenAiClient;
use crate::types::{InferenceOptions, LlmRequest, Message};

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

    // Parse the response structure directly
    let resp: serde_json::Value = serde_json::from_str(json).unwrap();
    assert_eq!(resp["choices"][0]["message"]["content"], "Hello!");
    assert_eq!(resp["usage"]["prompt_tokens"], 10);
}

#[test]
fn response_parsing_no_usage() {
    let json = r#"{
        "choices": [{
            "message": {"role": "assistant", "content": "Hi"},
            "finish_reason": "stop"
        }]
    }"#;

    let resp: serde_json::Value = serde_json::from_str(json).unwrap();
    assert!(resp["usage"].is_null());
}

#[test]
fn ollama_config_no_api_key() {
    let client = OpenAiClient::new(
        Some("http://localhost:11434/v1".into()),
        None,
    );
    let _ = client;
}

#[test]
fn default_base_url() {
    let client = OpenAiClient::new(None, Some("sk-test".into()));
    let _ = client;
}
