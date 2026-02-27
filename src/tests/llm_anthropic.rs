use crate::llm::anthropic::AnthropicClient;
use crate::types::{InferenceOptions, LlmRequest, Message};

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

    // Parse the response structure directly
    let resp: serde_json::Value = serde_json::from_str(json).unwrap();
    let content: String = resp["content"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|b| b["type"] == "text")
        .map(|b| b["text"].as_str().unwrap())
        .collect::<Vec<_>>()
        .join("");

    assert_eq!(content, "Hello world!");
    assert_eq!(resp["usage"]["input_tokens"], 10);
    assert_eq!(resp["usage"]["output_tokens"], 5);
}

#[test]
fn custom_url() {
    let client = AnthropicClient::new("key".into())
        .with_url("http://localhost:8080/v1/messages".into());
    // Verify client was created (with_url returns Self)
    let _ = client;
}
