use crate::protocol::{INVALID_REQUEST, PARSE_ERROR};

use super::fixtures::make_server;

#[test]
fn initialize_returns_server_info() {
    let server = make_server();
    let input = r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#;
    let resp = server.handle_message_for_test(input).unwrap();
    assert!(resp.error.is_none());
    let result = resp.result.unwrap();
    assert_eq!(result["protocolVersion"], "2024-11-05");
    assert_eq!(result["serverInfo"]["name"], "rlm");
}

#[test]
fn tools_list_returns_two_tools() {
    let server = make_server();
    let input = r#"{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}"#;
    let resp = server.handle_message_for_test(input).unwrap();
    assert!(resp.error.is_none());
    let result = resp.result.unwrap();
    let tools = result["tools"].as_array().unwrap();
    assert_eq!(tools.len(), 2);
    let names: Vec<&str> = tools.iter().map(|t| t["name"].as_str().unwrap()).collect();
    assert!(names.contains(&"rlm_execute"));
    assert!(names.contains(&"rlm_templates"));
}

#[test]
fn tools_call_unknown_tool() {
    let server = make_server();
    let input = r#"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"nonexistent","arguments":{}}}"#;
    let resp = server.handle_message_for_test(input).unwrap();
    assert!(resp.error.is_some());
}

#[test]
fn parse_error_on_invalid_json() {
    let server = make_server();
    let resp = server.handle_message_for_test("not json").unwrap();
    assert!(resp.error.is_some());
    assert_eq!(resp.error.unwrap().code, PARSE_ERROR);
}

#[test]
fn invalid_request_on_wrong_version() {
    let server = make_server();
    let input = r#"{"jsonrpc":"1.0","id":4,"method":"ping","params":{}}"#;
    let resp = server.handle_message_for_test(input).unwrap();
    assert!(resp.error.is_some());
    assert_eq!(resp.error.unwrap().code, INVALID_REQUEST);
}

#[test]
fn ping_returns_empty_object() {
    let server = make_server();
    let input = r#"{"jsonrpc":"2.0","id":5,"method":"ping","params":{}}"#;
    let resp = server.handle_message_for_test(input).unwrap();
    assert!(resp.error.is_none());
}

#[test]
fn initialized_notification_returns_none() {
    let server = make_server();
    let input = r#"{"jsonrpc":"2.0","method":"initialized","params":{}}"#;
    let resp = server.handle_message_for_test(input);
    assert!(resp.is_none());
}

#[test]
fn templates_tool_returns_list() {
    let server = make_server();
    let input = r#"{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"rlm_templates","arguments":{}}}"#;
    let resp = server.handle_message_for_test(input).unwrap();
    assert!(resp.error.is_none());
    let result = resp.result.unwrap();
    let text = result["content"][0]["text"].as_str().unwrap();
    assert!(text.contains("academic-summary"));
}
