use crate::tools::templates::RlmTemplates;
use crate::tools::ToolHandler;

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
