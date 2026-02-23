use anyhow::Result;
use serde_json::Value;

use crate::prompt::templates::{list_templates, TemplateSource};
use crate::protocol::ToolResult;
use crate::tools::ToolHandler;

pub struct RlmTemplates;

impl ToolHandler for RlmTemplates {
    fn name(&self) -> &'static str {
        "rlm_templates"
    }

    fn description(&self) -> &'static str {
        "List available RLM prompt templates with descriptions"
    }

    fn input_schema(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {},
            "additionalProperties": false
        })
    }

    fn call(&self, _args: Value) -> Result<ToolResult> {
        // TODO: accept templates_dir from config/env
        let templates = list_templates(None)?;

        let items: Vec<Value> = templates
            .iter()
            .map(|t| {
                serde_json::json!({
                    "name": t.name,
                    "description": t.description,
                    "source": match &t.source {
                        TemplateSource::Builtin => "builtin".to_string(),
                        TemplateSource::File(p) => format!("file:{}", p.display()),
                    }
                })
            })
            .collect();

        Ok(ToolResult::ok(serde_json::to_string_pretty(&items)?))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn templates_tool_returns_list() {
        let tool = RlmTemplates;
        let result = tool.call(serde_json::json!({})).unwrap();
        assert!(!result.is_error);
        assert!(result.text.contains("academic-summary"));
        assert!(result.text.contains("builtin"));
    }

    #[test]
    fn templates_tool_schema_is_valid() {
        let tool = RlmTemplates;
        let schema = tool.input_schema();
        assert_eq!(schema["type"], "object");
    }
}
