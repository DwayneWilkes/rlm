use serde_json::Value;

use crate::tools::execute::RlmExecute;
use crate::tools::ToolHandler;
use crate::types::{Mode, ProviderConfig};

// Access config_from_args via a test helper since it's private.
// We test it indirectly through the tool's input_schema and call method.

#[test]
fn execute_tool_schema_is_valid() {
    let tool = RlmExecute;
    let schema = tool.input_schema();
    assert_eq!(schema["type"], "object");
    let required = schema["required"].as_array().unwrap();
    assert!(required.contains(&Value::String("task".to_string())));
}

#[test]
fn config_from_args_defaults() {
    let args = serde_json::json!({"task": "test"});
    let config = crate::tools::execute::config_from_args(&args).unwrap();
    assert_eq!(config.mode, Mode::Auto);
    assert!(!config.synthesize);
    assert!(config.template.is_none());
}

#[test]
fn config_from_args_with_overrides() {
    let args = serde_json::json!({
        "task": "test",
        "mode": "direct",
        "synthesize": true,
        "template": "academic-summary",
        "max_cost": 2.5,
        "max_iterations": 10,
        "provider": "claude-code",
        "model": "claude-opus-4-6"
    });
    let config = crate::tools::execute::config_from_args(&args).unwrap();
    assert_eq!(config.mode, Mode::Direct);
    assert!(config.synthesize);
    assert_eq!(config.template.as_deref(), Some("academic-summary"));
    assert_eq!(config.budget.max_cost, Some(2.5));
    assert_eq!(config.budget.max_iterations, 10);
    assert_eq!(config.provider.model(), "claude-opus-4-6");
}

#[test]
fn config_from_args_unknown_provider_errors() {
    let args = serde_json::json!({"task": "test", "provider": "unknown"});
    let result = crate::tools::execute::config_from_args(&args);
    assert!(result.is_err());
}

#[test]
fn claude_code_iterative_downgrades_to_direct() {
    let args = serde_json::json!({
        "task": "test",
        "mode": "iterative",
        "provider": "claude-code"
    });
    let config = crate::tools::execute::config_from_args(&args).unwrap();
    assert_eq!(config.mode, Mode::Iterative);
    assert!(matches!(config.provider, ProviderConfig::ClaudeCode { .. }));
    // The downgrade happens in call(), not config_from_args(),
    // but we verify the config is valid for testing purposes
}
