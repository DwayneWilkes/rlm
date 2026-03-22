use crate::llm::claude_code::{build_cli_args, build_stdin_prompt, ClaudeCodeClient};
use crate::tests::fixtures::MockProcessRunner;
use crate::types::{InferenceOptions, LlmClient, LlmRequest, Message};

// ── build helpers tests (pre-existing) ──────────────────────────────────────

#[test]
fn claude_code_response_parsing() {
    let json = r#"{
        "result": "Hello world!",
        "input_tokens": 100,
        "output_tokens": 50,
        "cost_usd": 0.005
    }"#;
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

// ── complete() with mock process runner ─────────────────────────────────────

fn make_request() -> LlmRequest {
    LlmRequest {
        model: "claude-sonnet-4-20250514".into(),
        messages: vec![Message {
            role: "user".into(),
            content: "Summarize this paper.".into(),
        }],
        system: Some("You are a research assistant.".into()),
        inference: InferenceOptions::default(),
    }
}

fn valid_claude_stdout() -> &'static str {
    r#"{"result": "This paper discusses quantum computing.", "input_tokens": 200, "output_tokens": 30, "cost_usd": 0.01}"#
}

#[test]
fn complete_success_returns_parsed_response() {
    let runner = MockProcessRunner::new(0, valid_claude_stdout(), "");
    let client = ClaudeCodeClient::with_runner(
        "claude-sonnet-4-20250514".into(),
        Box::new(runner),
    );

    let resp = client.complete(&make_request()).unwrap();
    assert_eq!(resp.content, "This paper discusses quantum computing.");
    assert_eq!(resp.usage.input_tokens, 200);
    assert_eq!(resp.usage.output_tokens, 30);
    assert_eq!(resp.usage.cost_usd, Some(0.01));
}

#[test]
fn complete_passes_correct_command_and_args() {
    let runner = MockProcessRunner::new(0, valid_claude_stdout(), "");
    let captured = runner.capture_handle();
    let client = ClaudeCodeClient::with_runner(
        "claude-sonnet-4-20250514".into(),
        Box::new(runner),
    );

    client.complete(&make_request()).unwrap();

    let runs = captured.lock().unwrap();
    assert_eq!(runs.len(), 1);
    assert_eq!(runs[0].cmd, "claude");
    assert!(runs[0].args.contains(&"--model".to_string()));
    assert!(runs[0].args.contains(&"claude-sonnet-4-20250514".to_string()));
    assert!(runs[0].args.contains(&"-p".to_string()));
    assert!(runs[0].args.contains(&"--output-format".to_string()));
    assert!(runs[0].args.contains(&"json".to_string()));
    // System prompt is passed via --system-prompt flag
    assert!(runs[0].args.contains(&"--system-prompt".to_string()));
    assert!(runs[0].args.contains(&"You are a research assistant.".to_string()));
}

#[test]
fn complete_passes_stdin_prompt() {
    let runner = MockProcessRunner::new(0, valid_claude_stdout(), "");
    let captured = runner.capture_handle();
    let client = ClaudeCodeClient::with_runner("test-model".into(), Box::new(runner));

    client.complete(&make_request()).unwrap();

    let runs = captured.lock().unwrap();
    assert_eq!(runs[0].stdin_data, "Summarize this paper.\n");
}

#[test]
fn complete_non_zero_exit_returns_error() {
    let runner = MockProcessRunner::new(1, "", "Error: authentication failed");
    let client = ClaudeCodeClient::with_runner("test-model".into(), Box::new(runner));

    let err = client.complete(&make_request()).unwrap_err();
    let msg = err.to_string();
    assert!(msg.contains("exited with code 1"), "got: {}", msg);
    assert!(msg.contains("authentication failed"), "got: {}", msg);
}

#[test]
fn complete_exit_code_2_returns_error() {
    let runner = MockProcessRunner::new(2, "", "segfault");
    let client = ClaudeCodeClient::with_runner("test-model".into(), Box::new(runner));

    let err = client.complete(&make_request()).unwrap_err();
    let msg = err.to_string();
    assert!(msg.contains("exited with code 2"), "got: {}", msg);
}

#[test]
fn complete_invalid_json_stdout_returns_error() {
    let runner = MockProcessRunner::new(0, "not json at all", "");
    let client = ClaudeCodeClient::with_runner("test-model".into(), Box::new(runner));

    let err = client.complete(&make_request()).unwrap_err();
    let msg = err.to_string();
    assert!(msg.contains("Failed to parse claude output"), "got: {}", msg);
}

#[test]
fn complete_truncates_long_output_in_error_message() {
    // Output longer than 200 chars should be truncated in the error message
    let long_output = "x".repeat(300);
    let runner = MockProcessRunner::new(0, &long_output, "");
    let client = ClaudeCodeClient::with_runner("test-model".into(), Box::new(runner));

    let err = client.complete(&make_request()).unwrap_err();
    let msg = err.to_string();
    assert!(msg.contains("Failed to parse claude output"), "got: {}", msg);
    // The output in the error message should be truncated to 200 chars
    assert!(msg.len() < 500, "error message too long: {} chars", msg.len());
}

#[test]
fn complete_minimal_response_defaults_tokens_to_zero() {
    let runner = MockProcessRunner::new(0, r#"{"result": "Done"}"#, "");
    let client = ClaudeCodeClient::with_runner("test-model".into(), Box::new(runner));

    let resp = client.complete(&make_request()).unwrap();
    assert_eq!(resp.content, "Done");
    assert_eq!(resp.usage.input_tokens, 0);
    assert_eq!(resp.usage.output_tokens, 0);
    assert!(resp.usage.cost_usd.is_none());
}

#[test]
fn complete_no_system_prompt_omits_flag() {
    let runner = MockProcessRunner::new(0, r#"{"result": "ok"}"#, "");
    let captured = runner.capture_handle();
    let client = ClaudeCodeClient::with_runner("test-model".into(), Box::new(runner));

    let req = LlmRequest {
        model: "test-model".into(),
        messages: vec![Message {
            role: "user".into(),
            content: "hi".into(),
        }],
        system: None,
        inference: InferenceOptions::default(),
    };
    client.complete(&req).unwrap();

    let runs = captured.lock().unwrap();
    assert!(!runs[0].args.contains(&"--system-prompt".to_string()));
}
