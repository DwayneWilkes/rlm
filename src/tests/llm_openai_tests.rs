use crate::llm::openai::OpenAiClient;
use crate::tests::fixtures::MockHttpTransport;
use crate::types::{InferenceOptions, LlmClient, LlmRequest, Message};

// ── build_body tests (pre-existing) ────────────────────────────────────────

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
            top_k: Some(40),
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

// ── complete() with mock transport ──────────────────────────────────────────

fn make_request() -> LlmRequest {
    LlmRequest {
        model: "gpt-4o".into(),
        messages: vec![Message {
            role: "user".into(),
            content: "Explain gravity.".into(),
        }],
        system: None,
        inference: InferenceOptions::default(),
    }
}

fn valid_openai_response() -> &'static str {
    r#"{
        "choices": [{
            "message": {"role": "assistant", "content": "Gravity is a fundamental force."},
            "finish_reason": "stop"
        }],
        "usage": {"prompt_tokens": 15, "completion_tokens": 8, "total_tokens": 23}
    }"#
}

#[test]
fn complete_success_returns_parsed_response() {
    let transport = MockHttpTransport::new(200, valid_openai_response());
    let client = OpenAiClient::with_transport(None, Some("sk-key".into()), Box::new(transport));

    let resp = client.complete(&make_request()).unwrap();
    assert_eq!(resp.content, "Gravity is a fundamental force.");
    assert_eq!(resp.usage.input_tokens, 15);
    assert_eq!(resp.usage.output_tokens, 8);
    assert!(resp.usage.cost_usd.is_none());
}

#[test]
fn complete_sends_authorization_header_when_api_key_present() {
    let transport = MockHttpTransport::new(200, valid_openai_response());
    let captured = transport.capture_handle();
    let client = OpenAiClient::with_transport(None, Some("sk-secret".into()), Box::new(transport));

    client.complete(&make_request()).unwrap();

    let posts = captured.lock().unwrap();
    assert_eq!(posts.len(), 1);
    let header_map: std::collections::HashMap<&str, &str> = posts[0]
        .headers
        .iter()
        .map(|(k, v)| (k.as_str(), v.as_str()))
        .collect();
    assert_eq!(header_map.get("Authorization"), Some(&"Bearer sk-secret"));
    assert_eq!(header_map.get("Content-Type"), Some(&"application/json"));
}

#[test]
fn complete_omits_authorization_header_when_no_api_key() {
    let transport = MockHttpTransport::new(200, valid_openai_response());
    let captured = transport.capture_handle();
    let client = OpenAiClient::with_transport(None, None, Box::new(transport));

    client.complete(&make_request()).unwrap();

    let posts = captured.lock().unwrap();
    let has_auth = posts[0].headers.iter().any(|(k, _)| k == "Authorization");
    assert!(!has_auth, "Authorization header should be absent when no API key");
}

#[test]
fn complete_uses_correct_url_with_custom_base() {
    let transport = MockHttpTransport::new(200, valid_openai_response());
    let captured = transport.capture_handle();
    let client = OpenAiClient::with_transport(
        Some("http://localhost:11434/v1".into()),
        None,
        Box::new(transport),
    );

    client.complete(&make_request()).unwrap();

    let posts = captured.lock().unwrap();
    assert_eq!(posts[0].url, "http://localhost:11434/v1/chat/completions");
}

#[test]
fn complete_uses_default_url_when_no_base() {
    let transport = MockHttpTransport::new(200, valid_openai_response());
    let captured = transport.capture_handle();
    let client = OpenAiClient::with_transport(None, None, Box::new(transport));

    client.complete(&make_request()).unwrap();

    let posts = captured.lock().unwrap();
    assert_eq!(posts[0].url, "https://api.openai.com/v1/chat/completions");
}

#[test]
fn complete_non_200_returns_error() {
    let transport = MockHttpTransport::new(401, r#"{"error": "invalid api key"}"#);
    let client = OpenAiClient::with_transport(None, Some("bad-key".into()), Box::new(transport));

    let err = client.complete(&make_request()).unwrap_err();
    let msg = err.to_string();
    assert!(msg.contains("HTTP 401"), "got: {}", msg);
    assert!(msg.contains("invalid api key"), "got: {}", msg);
}

#[test]
fn complete_malformed_json_returns_error() {
    let transport = MockHttpTransport::new(200, "{{not json}}");
    let client = OpenAiClient::with_transport(None, None, Box::new(transport));

    let err = client.complete(&make_request()).unwrap_err();
    let msg = err.to_string();
    assert!(
        msg.contains("expected") || msg.contains("invalid") || msg.contains("key must be"),
        "expected JSON parse error, got: {}",
        msg,
    );
}

#[test]
fn complete_no_usage_in_response_defaults_to_zero() {
    let body = r#"{
        "choices": [{
            "message": {"role": "assistant", "content": "Hi"},
            "finish_reason": "stop"
        }]
    }"#;
    let transport = MockHttpTransport::new(200, body);
    let client = OpenAiClient::with_transport(None, None, Box::new(transport));

    let resp = client.complete(&make_request()).unwrap();
    assert_eq!(resp.content, "Hi");
    assert_eq!(resp.usage.input_tokens, 0);
    assert_eq!(resp.usage.output_tokens, 0);
}

#[test]
fn complete_empty_choices_returns_empty_content() {
    let body = r#"{"choices": [], "usage": {"prompt_tokens": 5, "completion_tokens": 0, "total_tokens": 5}}"#;
    let transport = MockHttpTransport::new(200, body);
    let client = OpenAiClient::with_transport(None, None, Box::new(transport));

    let resp = client.complete(&make_request()).unwrap();
    assert_eq!(resp.content, "");
}

#[test]
fn complete_serializes_request_body_correctly() {
    let transport = MockHttpTransport::new(200, valid_openai_response());
    let captured = transport.capture_handle();
    let client = OpenAiClient::with_transport(None, None, Box::new(transport));

    let req = LlmRequest {
        model: "gpt-4o".into(),
        messages: vec![Message {
            role: "user".into(),
            content: "test".into(),
        }],
        system: Some("Be concise.".into()),
        inference: InferenceOptions {
            temperature: Some(0.7),
            ..InferenceOptions::default()
        },
    };

    client.complete(&req).unwrap();

    let posts = captured.lock().unwrap();
    let body: serde_json::Value = serde_json::from_str(&posts[0].body).unwrap();
    assert_eq!(body["model"], "gpt-4o");
    // System prompt becomes the first message
    assert_eq!(body["messages"][0]["role"], "system");
    assert_eq!(body["messages"][0]["content"], "Be concise.");
    assert_eq!(body["messages"][1]["role"], "user");
    assert_eq!(body["messages"][1]["content"], "test");
    assert_eq!(body["temperature"], 0.7);
}
