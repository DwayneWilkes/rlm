use std::collections::HashMap;

use crate::prompt::{build_direct_system_prompt, build_iterative_system_prompt, resolve_system_prompt};
use crate::types::{Budget, Mode, PromptTemplate};

#[test]
fn iterative_prompt_contains_core_elements() {
    let budget = Budget::default();
    let prompt = build_iterative_system_prompt(&budget, 0, "claude-sonnet-4-20250514", &HashMap::new());
    assert!(prompt.contains("RLM"));
    assert!(prompt.contains("context"));
    assert!(prompt.contains("llm_query"));
    assert!(prompt.contains("rlm_query"));
    assert!(prompt.contains("FINAL("));
    assert!(prompt.contains("FINAL_VAR("));
    assert!(prompt.contains("```repl"));
}

#[test]
fn iterative_prompt_includes_budget_info() {
    let budget = Budget {
        max_cost: Some(5.0),
        max_iterations: 30,
        ..Budget::default()
    };
    let prompt = build_iterative_system_prompt(&budget, 0, "test", &HashMap::new());
    assert!(prompt.contains("$5.00"));
    assert!(prompt.contains("30"));
}

#[test]
fn sub_rlm_prompt_includes_depth_context() {
    let budget = Budget::default();
    let prompt = build_iterative_system_prompt(&budget, 2, "test", &HashMap::new());
    assert!(prompt.contains("SUB-RLM"));
    assert!(prompt.contains("depth 2/"));
    assert!(prompt.contains("EFFICIENCY GUIDELINES"));
}

#[test]
fn root_rlm_prompt_excludes_sub_rlm_context() {
    let budget = Budget::default();
    let prompt = build_iterative_system_prompt(&budget, 0, "test", &HashMap::new());
    assert!(!prompt.contains("SUB-RLM"));
}

#[test]
fn model_hints_included_when_present() {
    let budget = Budget::default();
    let mut hints = HashMap::new();
    hints.insert("qwen3".to_string(), "Be extra careful with code formatting".to_string());
    let prompt = build_iterative_system_prompt(&budget, 0, "qwen3", &hints);
    assert!(prompt.contains("MODEL HINTS (for qwen3)"));
    assert!(prompt.contains("code formatting"));
}

#[test]
fn model_hints_absent_for_unknown_model() {
    let budget = Budget::default();
    let hints = HashMap::new();
    let prompt = build_iterative_system_prompt(&budget, 0, "unknown", &hints);
    assert!(!prompt.contains("MODEL HINTS"));
}

#[test]
fn direct_prompt_default() {
    let prompt = build_direct_system_prompt(None);
    assert!(prompt.contains("helpful assistant"));
}

#[test]
fn direct_prompt_from_template() {
    let template = PromptTemplate {
        name: "test".into(),
        description: "test".into(),
        mode: None,
        system_prompt: Some("Custom direct prompt".into()),
        inference: None,
        synthesize: None,
    };
    let prompt = build_direct_system_prompt(Some(&template));
    assert_eq!(prompt, "Custom direct prompt");
}

#[test]
fn resolve_uses_template_system_prompt_when_present() {
    let template = PromptTemplate {
        name: "test".into(),
        description: "test".into(),
        mode: None,
        system_prompt: Some("Template override".into()),
        inference: None,
        synthesize: None,
    };
    let budget = Budget::default();
    let prompt = resolve_system_prompt(
        Mode::Iterative,
        Some(&template),
        &budget,
        0,
        "test",
        &HashMap::new(),
    );
    assert_eq!(prompt, "Template override");
}

#[test]
fn resolve_falls_back_to_mode_default() {
    let budget = Budget::default();
    let prompt = resolve_system_prompt(
        Mode::Direct,
        None,
        &budget,
        0,
        "test",
        &HashMap::new(),
    );
    assert!(prompt.contains("helpful assistant"));
}

/// Template without system_prompt should fall back to mode default for Direct.
#[test]
fn resolve_template_without_system_prompt_falls_back_direct() {
    let template = PromptTemplate {
        name: "no-prompt".into(),
        description: "no prompt".into(),
        mode: None,
        system_prompt: None,
        inference: None,
        synthesize: None,
    };
    let budget = Budget::default();
    let prompt = resolve_system_prompt(
        Mode::Direct,
        Some(&template),
        &budget,
        0,
        "test",
        &HashMap::new(),
    );
    assert!(prompt.contains("helpful assistant"));
}

/// Template without system_prompt should fall back to mode default for Iterative.
#[test]
fn resolve_template_without_system_prompt_falls_back_iterative() {
    let template = PromptTemplate {
        name: "no-prompt".into(),
        description: "no prompt".into(),
        mode: None,
        system_prompt: None,
        inference: None,
        synthesize: None,
    };
    let budget = Budget::default();
    let prompt = resolve_system_prompt(
        Mode::Iterative,
        Some(&template),
        &budget,
        0,
        "test",
        &HashMap::new(),
    );
    assert!(prompt.contains("RLM"));
}

/// Auto mode should use iterative system prompt.
#[test]
fn resolve_auto_mode_uses_iterative_prompt() {
    let budget = Budget::default();
    let prompt = resolve_system_prompt(
        Mode::Auto,
        None,
        &budget,
        0,
        "test",
        &HashMap::new(),
    );
    assert!(prompt.contains("RLM"));
}

/// Direct prompt from template with no system_prompt returns default.
#[test]
fn direct_prompt_from_template_without_system_prompt() {
    let template = PromptTemplate {
        name: "test".into(),
        description: "test".into(),
        mode: None,
        system_prompt: None,
        inference: None,
        synthesize: None,
    };
    let prompt = build_direct_system_prompt(Some(&template));
    assert!(prompt.contains("helpful assistant"));
}

/// Budget with no max_cost omits cost line from iterative prompt.
#[test]
fn iterative_prompt_no_cost_budget() {
    let budget = Budget {
        max_cost: None,
        ..Budget::default()
    };
    let prompt = build_iterative_system_prompt(&budget, 0, "test", &HashMap::new());
    assert!(!prompt.contains("Max cost:"));
}
