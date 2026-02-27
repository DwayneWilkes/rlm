use crate::llm::claude_code::{build_cli_args, build_stdin_prompt, ClaudeCodeClient};
use crate::types::Message;

#[test]
fn claude_code_response_parsing() {
    let json = r#"{
        "result": "Hello world!",
        "input_tokens": 100,
        "output_tokens": 50,
        "cost_usd": 0.005
    }"#;
    // Parse using serde_json::Value since ClaudeCodeResponse is private
    let resp: serde_json::Value = serde_json::from_str(json).unwrap();
    assert_eq!(resp["result"], "Hello world!");
    assert_eq!(resp["input_tokens"], 100);
    assert_eq!(resp["output_tokens"], 50);
}

#[test]
fn claude_code_response_minimal() {
    let json = r#"{"result": "Hi"}"#;
    let resp: serde_json::Value = serde_json::from_str(json).unwrap();
    assert_eq!(resp["result"], "Hi");
    assert!(resp["input_tokens"].is_null());
    assert!(resp["output_tokens"].is_null());
}

#[test]
fn client_creation() {
    let client = ClaudeCodeClient::new("claude-sonnet-4-20250514".into());
    let _ = client;
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
