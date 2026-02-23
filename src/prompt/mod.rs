pub mod templates;

use std::collections::HashMap;

use crate::types::{Budget, Mode, PromptTemplate};

/// Build the system prompt for iterative mode (the core RLM prompt from Zhang et al. 2025).
pub fn build_iterative_system_prompt(
    budget: &Budget,
    depth: u32,
    model: &str,
    model_hints: &HashMap<String, String>,
) -> String {
    let mut prompt = String::new();

    // Sub-RLM context
    if depth > 0 {
        prompt.push_str(&format!(
            "[SUB-RLM CONTEXT]\n\
             You are a SUB-RLM at depth {}/{}.\n\
             You were spawned by a parent RLM to handle a specific sub-task.\n\n\
             EFFICIENCY GUIDELINES:\n\
             - Your budget is LIMITED — be strategic, not exhaustive\n\
             - Prefer llm_query() over rlm_query() unless truly necessary\n\
             - Aim to complete in 2-5 iterations, not 10+\n\
             - Return FINAL() as soon as you have a reasonable answer\n\n",
            depth, budget.max_depth
        ));
    }

    prompt.push_str(
        "You are an RLM (Recursive Language Model). You solve complex tasks by examining \
         context, executing Python code, and delegating sub-tasks.\n\n\
         ENVIRONMENT:\n\
         - `context`: String variable with your input\n\
         - `llm_query(prompt)`: Query an LLM for simple tasks\n\
         - `rlm_query(task, ctx)`: Spawn a sub-RLM for complex sub-tasks (PREFERRED)\n\
         - `batch_llm_query(prompts)`: Execute multiple LLM queries in parallel\n\
         - `batch_rlm_query(tasks)`: Execute multiple sub-RLMs concurrently\n\
         - `chunk_text(text, size, overlap)`: Split text into chunks\n\
         - `parse_academic_paper()`: Parse context as academic paper\n\
         - Full Python standard library\n\n",
    );

    prompt.push_str(
        "ACCURACY (CRITICAL):\n\
         - Check the content of the 'context' variable to avoid hallucinations\n\
         - ALWAYS quote exact text when referencing code or data\n\
         - NEVER assume values from memory — verify against actual context\n\
         - If you cannot find evidence, say \"not found in context\"\n\n",
    );

    // Budget info
    prompt.push_str("BUDGET:\n");
    if let Some(cost) = budget.max_cost {
        prompt.push_str(&format!("  Max cost: ${:.2}\n", cost));
    }
    prompt.push_str(&format!(
        "  Max iterations: {} | Max depth: {}/{}\n\n",
        budget.max_iterations, depth, budget.max_depth
    ));

    prompt.push_str(
        "EXECUTION:\n\
         Write Python in ```repl blocks. Multiple blocks in one response execute sequentially.\n\n\
         STRATEGY:\n\
         1. First examine context structure\n\
         2. Batch multiple operations in one response when possible\n\
         3. For complex sub-tasks, use rlm_query()\n\
         4. Build answers incrementally in variables\n\
         5. VERIFY claims before stating them\n\n",
    );

    // Model hints
    if let Some(hint) = model_hints.get(model) {
        prompt.push_str(&format!("MODEL HINTS (for {}):\n- {}\n\n", model, hint));
    }

    prompt.push_str(
        "TERMINATION:\n\
         - FINAL(your answer here) — Direct answer\n\
         - FINAL_VAR(variable_name) — Return variable contents\n",
    );

    prompt
}

/// Build the system prompt for direct mode.
pub fn build_direct_system_prompt(template: Option<&PromptTemplate>) -> String {
    if let Some(t) = template {
        if let Some(ref sp) = t.system_prompt {
            return sp.clone();
        }
    }

    "You are a helpful assistant. Analyze the provided context and answer the \
     user's question directly and thoroughly."
        .to_string()
}

/// Resolve which system prompt to use based on mode and template.
pub fn resolve_system_prompt(
    mode: Mode,
    template: Option<&PromptTemplate>,
    budget: &Budget,
    depth: u32,
    model: &str,
    model_hints: &HashMap<String, String>,
) -> String {
    // Template system prompt overrides the default for any mode
    if let Some(t) = template {
        if let Some(ref sp) = t.system_prompt {
            return sp.clone();
        }
    }

    match mode {
        Mode::Direct => build_direct_system_prompt(None),
        Mode::Iterative | Mode::Auto => {
            build_iterative_system_prompt(budget, depth, model, model_hints)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
