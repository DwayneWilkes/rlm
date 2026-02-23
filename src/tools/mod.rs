use anyhow::Result;
use serde_json::Value;

use crate::protocol::ToolResult;

pub mod execute;
pub mod templates;

pub use execute::RlmExecute;
pub use templates::RlmTemplates;

/// Trait implemented by each MCP tool handler.
pub trait ToolHandler {
    fn name(&self) -> &'static str;
    fn description(&self) -> &'static str;
    fn input_schema(&self) -> Value;
    fn call(&self, args: Value) -> Result<ToolResult>;
}

/// Create all registered tool handlers.
pub fn all_tools() -> Vec<Box<dyn ToolHandler>> {
    vec![
        Box::new(RlmExecute),
        Box::new(RlmTemplates),
    ]
}
