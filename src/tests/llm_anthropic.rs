use crate::llm::anthropic::AnthropicClient;
use crate::tests::fixtures::MockHttpTransport;
use crate::types::{InferenceOptions, LlmClient, LlmRequest, Message};

// ── build_body tests (pre-existing) ────────────────────────────────────────

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
            seed: Some(42),
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
    let _ = client;
}

// ── complete() with mock transport ──────────────────────────────────────────

fn make_request() -> LlmRequest {
    LlmRequest {
        model: "claude-sonnet-4-20250514".into(),
        messages: vec![Message {
            role: "user".into(),
            content: "What is 2+2?".into(),
        }],
        system: Some("You are a math tutor.".into()),
        inference: InferenceOptions::default(),
    }
}

fn valid_anthropic_response() -> &'static str {
    r#"{
        "content": [{"type": "text", "text": "The answer is 4."}],
        "usage": {"input_tokens": 25, "output_tokens": 10}
    }"#
}

#[test]
fn complete_success_returns_parsed_response() {
    let transport = MockHttpTransport::new(200, valid_anthropic_response());
    let client = AnthropicClient::with_transport("sk-test-key".into(), Box::new(transport));

    let resp = client.complete(&make_request()).unwrap();
    assert_eq!(resp.content, "The answer is 4.");
    assert_eq!(resp.usage.input_tokens, 25);
    assert_eq!(resp.usage.output_tokens, 10);
    assert!(resp.usage.cost_usd.is_none());
}

#[test]
fn complete_sends_correct_headers() {
    let transport = MockHttpTransport::new(200, valid_anthropic_response());
    let captured = transport.capture_handle();
    let client = AnthropicClient::with_transport("sk-my-key".into(), Box::new(transport));

    client.complete(&make_request()).unwrap();

    let posts = captured.lock().unwrap();
    assert_eq!(posts.len(), 1);
    let post = &posts[0];

    // Verify URL
    assert_eq!(post.url, "https://api.anthropic.com/v1/messages");

    // Verify headers
    let header_map: std::collections::HashMap<&str, &str> = post
        .headers
        .iter()
        .map(|(k, v)| (k.as_str(), v.as_str()))
        .collect();
    assert_eq!(header_map.get("Content-Type"), Some(&"application/json"));
    assert_eq!(header_map.get("X-API-Key"), Some(&"sk-my-key"));
    assert_eq!(header_map.get("anthropic-version"), Some(&"2023-06-01"));
}

#[test]
fn complete_serializes_request_body_correctly() {
    let transport = MockHttpTransport::new(200, valid_anthropic_response());
    let captured = transport.capture_handle();
    let client = AnthropicClient::with_transport("sk-key".into(), Box::new(transport));

    client.complete(&make_request()).unwrap();

    let posts = captured.lock().unwrap();
    let body: serde_json::Value = serde_json::from_str(&posts[0].body).unwrap();
    assert_eq!(body["model"], "claude-sonnet-4-20250514");
    assert_eq!(body["system"], "You are a math tutor.");
    assert_eq!(body["messages"][0]["role"], "user");
    assert_eq!(body["messages"][0]["content"], "What is 2+2?");
    assert_eq!(body["max_tokens"], 4096);
}

#[test]
fn complete_non_200_returns_error() {
    let transport = MockHttpTransport::new(429, r#"{"error": "rate limited"}"#);
    let client = AnthropicClient::with_transport("sk-key".into(), Box::new(transport));

    let err = client.complete(&make_request()).unwrap_err();
    let msg = err.to_string();
    assert!(msg.contains("HTTP 429"), "expected HTTP 429, got: {}", msg);
    assert!(msg.contains("rate limited"), "expected body in error, got: {}", msg);
}

#[test]
fn complete_500_returns_error_with_body() {
    let transport = MockHttpTransport::new(500, "Internal Server Error");
    let client = AnthropicClient::with_transport("sk-key".into(), Box::new(transport));

    let err = client.complete(&make_request()).unwrap_err();
    let msg = err.to_string();
    assert!(msg.contains("HTTP 500"), "got: {}", msg);
    assert!(msg.contains("Internal Server Error"), "got: {}", msg);
}

#[test]
fn complete_malformed_json_returns_error() {
    let transport = MockHttpTransport::new(200, "not valid json {{{");
    let client = AnthropicClient::with_transport("sk-key".into(), Box::new(transport));

    let err = client.complete(&make_request()).unwrap_err();
    let msg = err.to_string();
    assert!(
        msg.contains("expected") || msg.contains("invalid") || msg.contains("key must be"),
        "expected JSON parse error, got: {}",
        msg,
    );
}

#[test]
fn complete_missing_usage_field_returns_error() {
    let transport = MockHttpTransport::new(
        200,
        r#"{"content": [{"type": "text", "text": "hi"}]}"#,
    );
    let client = AnthropicClient::with_transport("sk-key".into(), Box::new(transport));

    let err = client.complete(&make_request()).unwrap_err();
    let msg = err.to_string();
    assert!(msg.contains("usage"), "expected missing field error, got: {}", msg);
}

#[test]
fn complete_multi_block_concatenation() {
    let body = r#"{
        "content": [
            {"type": "text", "text": "Part 1. "},
            {"type": "image", "text": "IGNORED"},
            {"type": "text", "text": "Part 2."}
        ],
        "usage": {"input_tokens": 5, "output_tokens": 3}
    }"#;
    let transport = MockHttpTransport::new(200, body);
    let client = AnthropicClient::with_transport("sk-key".into(), Box::new(transport));

    let resp = client.complete(&make_request()).unwrap();
    // Only "text" type blocks are included; "image" is filtered out
    assert_eq!(resp.content, "Part 1. Part 2.");
}
