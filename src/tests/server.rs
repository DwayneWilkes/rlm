use crate::protocol::{INVALID_PARAMS, INVALID_REQUEST, METHOD_NOT_FOUND, PARSE_ERROR};

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

#[test]
fn ping_result_is_empty_json_object() {
    let server = make_server();
    let input = r#"{"jsonrpc":"2.0","id":7,"method":"ping","params":{}}"#;
    let resp = server.handle_message_for_test(input).unwrap();
    assert!(resp.error.is_none());
    let result = resp.result.unwrap();
    assert_eq!(result, serde_json::json!({}));
}

#[test]
fn missing_name_in_tools_call_returns_invalid_params() {
    let server = make_server();
    // params is an object but has no "name" key
    let input = r#"{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"arguments":{}}}"#;
    let resp = server.handle_message_for_test(input).unwrap();
    let err = resp.error.unwrap();
    assert_eq!(err.code, INVALID_PARAMS);
    assert!(err.message.contains("name"));
}

#[test]
fn unknown_tool_returns_method_not_found() {
    let server = make_server();
    let input = r#"{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"does_not_exist","arguments":{}}}"#;
    let resp = server.handle_message_for_test(input).unwrap();
    let err = resp.error.unwrap();
    assert_eq!(err.code, METHOD_NOT_FOUND);
    assert!(err.message.contains("does_not_exist"));
}

#[test]
fn unknown_method_returns_method_not_found() {
    let server = make_server();
    let input = r#"{"jsonrpc":"2.0","id":10,"method":"resources/list","params":{}}"#;
    let resp = server.handle_message_for_test(input).unwrap();
    let err = resp.error.unwrap();
    assert_eq!(err.code, METHOD_NOT_FOUND);
    assert!(err.message.contains("resources/list"));
}

#[test]
fn malformed_json_returns_parse_error() {
    let server = make_server();
    let resp = server.handle_message_for_test("{invalid json}").unwrap();
    let err = resp.error.unwrap();
    assert_eq!(err.code, PARSE_ERROR);
}

#[test]
fn missing_method_returns_invalid_request() {
    let server = make_server();
    // Valid JSON, valid jsonrpc version, but no method field
    let input = r#"{"jsonrpc":"2.0","id":11,"params":{}}"#;
    let resp = server.handle_message_for_test(input).unwrap();
    let err = resp.error.unwrap();
    assert_eq!(err.code, INVALID_REQUEST);
}

#[test]
fn notifications_initialized_returns_none() {
    let server = make_server();
    let input = r#"{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}"#;
    let resp = server.handle_message_for_test(input);
    assert!(resp.is_none());
}
