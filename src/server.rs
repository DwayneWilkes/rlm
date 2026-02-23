use std::io::{self, BufRead, Write};

use serde_json::Value;

use crate::protocol::*;
use crate::tools::ToolHandler;

pub struct Server {
    tools: Vec<Box<dyn ToolHandler>>,
}

impl Server {
    pub fn new(tools: Vec<Box<dyn ToolHandler>>) -> Self {
        Self { tools }
    }

    pub fn run(&self) {
        let stdin = io::stdin();
        let stdout = io::stdout();
        let mut reader = stdin.lock();
        let mut writer = stdout.lock();
        let mut line = String::new();

        eprintln!("[rlm] Server started");

        loop {
            line.clear();
            match reader.read_line(&mut line) {
                Ok(0) => break,
                Ok(_) => {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }
                    if let Some(resp) = self.handle_message(trimmed) {
                        if let Ok(json) = serde_json::to_string(&resp) {
                            let _ = writeln!(writer, "{}", json);
                            let _ = writer.flush();
                        }
                    }
                }
                Err(e) => {
                    eprintln!("[rlm] stdin error: {}", e);
                    break;
                }
            }
        }
    }

    fn handle_message(&self, input: &str) -> Option<JsonRpcResponse> {
        let req: JsonRpcRequest = match serde_json::from_str(input) {
            Ok(r) => r,
            Err(_) => return Some(JsonRpcResponse::parse_error()),
        };

        match &req.jsonrpc {
            Some(v) if v == JSONRPC_VERSION => {}
            _ => {
                return Some(JsonRpcResponse::invalid_request(
                    req.id.unwrap_or(Value::Null),
                ));
            }
        }

        let id = req.id.clone().unwrap_or(Value::Null);

        let method = match &req.method {
            Some(m) => m.as_str(),
            None => return Some(JsonRpcResponse::invalid_request(id)),
        };

        match method {
            "initialize" => Some(self.handle_initialize(id)),
            "initialized" | "notifications/initialized" => None,
            "tools/list" => Some(self.handle_tools_list(id)),
            "tools/call" => Some(self.handle_tools_call(id, &req.params)),
            "ping" => Some(JsonRpcResponse::success(id, serde_json::json!({}))),
            _ => Some(JsonRpcResponse::method_not_found(id, method)),
        }
    }

    fn handle_initialize(&self, id: Value) -> JsonRpcResponse {
        let result = InitializeResult {
            protocol_version: MCP_VERSION.to_string(),
            capabilities: ServerCapabilities {
                tools: ToolsCapability { list_changed: false },
            },
            server_info: ServerInfo {
                name: "rlm".to_string(),
                version: env!("CARGO_PKG_VERSION").to_string(),
            },
        };
        JsonRpcResponse::success(id, serde_json::to_value(result).unwrap())
    }

    fn handle_tools_list(&self, id: Value) -> JsonRpcResponse {
        let tools: Vec<ToolDescriptor> = self
            .tools
            .iter()
            .map(|t| ToolDescriptor {
                name: t.name().to_string(),
                description: t.description().to_string(),
                input_schema: t.input_schema(),
            })
            .collect();
        let result = ToolsListResult { tools };
        JsonRpcResponse::success(id, serde_json::to_value(result).unwrap())
    }

    fn handle_tools_call(&self, id: Value, params: &Value) -> JsonRpcResponse {
        let tool_name = match params.get("name").and_then(|v| v.as_str()) {
            Some(name) => name,
            None => return JsonRpcResponse::invalid_params(id, "Missing 'name' in params"),
        };

        let args = params
            .get("arguments")
            .cloned()
            .unwrap_or(Value::Object(serde_json::Map::new()));

        let handler = self.tools.iter().find(|t| t.name() == tool_name);

        match handler {
            Some(h) => match h.call(args) {
                Ok(result) => {
                    let call_result: ToolCallResult = result.into();
                    JsonRpcResponse::success(id, serde_json::to_value(call_result).unwrap())
                }
                Err(e) => {
                    let call_result: ToolCallResult =
                        ToolResult::err(format!("Error: {}", e)).into();
                    JsonRpcResponse::success(id, serde_json::to_value(call_result).unwrap())
                }
            },
            None => JsonRpcResponse::method_not_found(id, tool_name),
        }
    }
}

#[cfg(test)]
impl Server {
    pub fn handle_message_for_test(&self, input: &str) -> Option<JsonRpcResponse> {
        self.handle_message(input)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tools::all_tools;

    fn make_server() -> Server {
        Server::new(all_tools())
    }

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
}
