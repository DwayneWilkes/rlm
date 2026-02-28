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

    // NOCOV: server I/O loop
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
