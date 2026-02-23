//! Integration test: exercises the full pipeline with mock LLM and sandbox.
//!
//! Covers: config loading → mode resolution → executor selection →
//!         LLM calls → sandbox execution → result formatting (JSON/YAML/text).

use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;

use anyhow::Result;

use rlm::config::{build_config, CliOverrides};
use rlm::engine::direct::DirectExecutor;
use rlm::engine::iterative::IterativeExecutor;
use rlm::engine::mode::resolve_mode;
use rlm::types::{
    Budget, Executor, InferenceOptions, LlmClient, LlmRequest, LlmResponse, Mode, Profile,
    ProviderConfig, RlmConfig, RlmResult, Sandbox, SandboxResponse, Usage,
};

// ── Mock LLM ────────────────────────────────────────────────────────────────

struct MockLlm {
    responses: Vec<String>,
    call_idx: AtomicU32,
    captured: Mutex<Vec<LlmRequest>>,
}

impl MockLlm {
    fn new(responses: Vec<&str>) -> Self {
        Self {
            responses: responses.into_iter().map(String::from).collect(),
            call_idx: AtomicU32::new(0),
            captured: Mutex::new(vec![]),
        }
    }
}

impl LlmClient for MockLlm {
    fn complete(&self, request: &LlmRequest) -> Result<LlmResponse> {
        self.captured.lock().unwrap().push(request.clone());
        let idx = self.call_idx.fetch_add(1, Ordering::SeqCst) as usize;
        let content = self
            .responses
            .get(idx)
            .cloned()
            .unwrap_or_else(|| "FINAL(fallback)".to_string());
        Ok(LlmResponse {
            content,
            usage: Usage {
                input_tokens: 150,
                output_tokens: 75,
                cost_usd: Some(0.002),
            },
        })
    }
}

// ── Mock Sandbox ────────────────────────────────────────────────────────────

struct MockSandbox {
    vars: HashMap<String, String>,
    exec_log: Vec<String>,
}

impl MockSandbox {
    fn new() -> Self {
        Self {
            vars: HashMap::new(),
            exec_log: vec![],
        }
    }
}

impl Sandbox for MockSandbox {
    fn init(&mut self, context: &str) -> Result<()> {
        self.vars.insert("context".into(), context.into());
        Ok(())
    }

    fn execute(&mut self, code: &str) -> Result<SandboxResponse> {
        self.exec_log.push(code.to_string());
        let stdout = if code.contains("print") {
            "mock output\n".to_string()
        } else if code.contains("result =") {
            self.vars
                .insert("result".into(), "integration_result".into());
            String::new()
        } else {
            String::new()
        };
        Ok(SandboxResponse {
            ok: true,
            stdout,
            stderr: String::new(),
            value: None,
            error: None,
            sub_calls: vec![],
        })
    }

    fn get_var(&mut self, name: &str) -> Result<Option<String>> {
        Ok(self.vars.get(name).cloned())
    }

    fn destroy(&mut self) -> Result<()> {
        Ok(())
    }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

fn default_config(mode: Mode) -> RlmConfig {
    RlmConfig {
        provider: ProviderConfig::Anthropic {
            model: "test-model".into(),
            api_key_env: None,
        },
        subcall_provider: None,
        inference: InferenceOptions::default(),
        budget: Budget {
            max_iterations: 10,
            max_time_seconds: 60,
            ..Budget::default()
        },
        mode,
        template: None,
        synthesize: false,
        model_hints: HashMap::new(),
        templates_dir: None,
    }
}

// ── Tests ───────────────────────────────────────────────────────────────────

/// Full pipeline: config → direct executor → result → JSON serialization.
#[test]
fn direct_mode_full_pipeline() {
    let mock = MockLlm::new(vec!["This paper presents a novel approach to..."]);
    let config = default_config(Mode::Direct);

    let executor = DirectExecutor::new(&mock);
    let result = executor
        .execute("Summarize this paper", "Abstract: We propose...", &config)
        .unwrap();

    // Verify result structure
    assert_eq!(result.answer, "This paper presents a novel approach to...");
    assert_eq!(result.trace.mode, Some(Mode::Direct));
    assert!(result.trace.iterations.is_empty());
    assert!(result.synthesis.is_none());

    // Verify usage tracked
    assert_eq!(result.trace.usage.input_tokens, 150);
    assert_eq!(result.trace.usage.output_tokens, 75);

    // Verify LLM received correct request
    let reqs = mock.captured.lock().unwrap();
    assert_eq!(reqs.len(), 1);
    assert!(reqs[0].messages[0].content.contains("Summarize this paper"));
    assert!(reqs[0].messages[0].content.contains("Abstract: We propose..."));
    assert!(reqs[0].system.is_some());
}

/// Full pipeline: config → iterative executor → REPL loop → FINAL → result.
#[test]
fn iterative_mode_full_pipeline() {
    let mock = MockLlm::new(vec![
        "Let me analyze the data.\n```repl\nprint(len(context))\n```",
        "Based on the output, I can see the data.\nFINAL(The document contains key findings about X.)",
    ]);
    let config = default_config(Mode::Iterative);

    let mut executor = IterativeExecutor::new(&mock, Box::new(MockSandbox::new()));
    let result = executor
        .execute_mut(
            "Summarize the key findings",
            "Long document text here...",
            &config,
        )
        .unwrap();

    // Verify answer extraction
    assert_eq!(
        result.answer,
        "The document contains key findings about X."
    );
    assert_eq!(result.trace.mode, Some(Mode::Iterative));

    // Verify iteration trace
    assert_eq!(result.trace.iterations.len(), 2);
    assert_eq!(result.trace.iterations[0].code_executions.len(), 1);
    assert_eq!(
        result.trace.iterations[0].code_executions[0].code,
        "print(len(context))"
    );

    // Verify usage accumulated across both iterations
    assert_eq!(result.trace.usage.input_tokens, 300); // 150 * 2
    assert_eq!(result.trace.usage.output_tokens, 150); // 75 * 2

    // No budget exhaustion
    assert!(result.trace.budget_exhausted.is_none());
}

/// Iterative mode with FINAL_VAR retrieves variable from sandbox.
#[test]
fn iterative_final_var_pipeline() {
    let mock = MockLlm::new(vec![
        "```repl\nresult = compute()\n```",
        "FINAL_VAR(result)",
    ]);
    let config = default_config(Mode::Iterative);

    let mut executor = IterativeExecutor::new(&mock, Box::new(MockSandbox::new()));
    let result = executor
        .execute_mut("Compute something", "data", &config)
        .unwrap();

    assert_eq!(result.answer, "integration_result");
}

/// Mode auto-resolution uses direct for short context.
#[test]
fn auto_mode_resolves_to_direct_for_short_context() {
    let short_context = "Short text.";
    let mode = resolve_mode(Mode::Auto, short_context, "claude-sonnet-4-20250514");
    assert_eq!(mode, Mode::Direct);
}

/// Mode auto-resolution uses iterative for large context.
#[test]
fn auto_mode_resolves_to_iterative_for_large_context() {
    // 200k model, 70% threshold = 140k tokens = ~560k chars
    let large_context = "x".repeat(600_000);
    let mode = resolve_mode(Mode::Auto, &large_context, "claude-sonnet-4-20250514");
    assert_eq!(mode, Mode::Iterative);
}

/// Config building from profile with CLI overrides.
#[test]
fn config_from_profile_with_overrides() {
    let profile = Profile {
        provider: Some(ProviderConfig::Anthropic {
            model: "claude-sonnet-4-20250514".into(),
            api_key_env: Some("ANTHROPIC_API_KEY".into()),
        }),
        mode: Some(Mode::Auto),
        synthesize: Some(false),
        ..Profile::default()
    };

    let overrides = CliOverrides {
        provider: None,
        mode: Some(Mode::Direct),
        template: Some("academic-summary".into()),
        synthesize: Some(true),
    };

    let config = build_config(&profile, &overrides).unwrap();
    assert_eq!(config.mode, Mode::Direct); // CLI override wins
    assert!(config.synthesize); // CLI override wins
    assert_eq!(config.template.as_deref(), Some("academic-summary"));
}

/// Synthesis pass appends a second LLM call.
#[test]
fn synthesis_pass_adds_second_call() {
    let mock = MockLlm::new(vec!["FINAL(raw extracted data)", "Polished synthesis."]);
    let mut config = default_config(Mode::Iterative);
    config.synthesize = true;

    let mut executor = IterativeExecutor::new(&mock, Box::new(MockSandbox::new()));
    let result = executor
        .execute_mut("Summarize", "data", &config)
        .unwrap();

    assert_eq!(result.answer, "raw extracted data");
    assert_eq!(result.synthesis, Some("Polished synthesis.".to_string()));

    // 2 calls: 1 iterative + 1 synthesis
    let reqs = mock.captured.lock().unwrap();
    assert_eq!(reqs.len(), 2);
}

/// Budget exhaustion stops iterative execution.
#[test]
fn budget_exhaustion_stops_iteration() {
    let mock = MockLlm::new(vec!["thinking...", "still thinking...", "more..."]);
    let mut config = default_config(Mode::Iterative);
    config.budget.max_iterations = 2;

    let mut executor = IterativeExecutor::new(&mock, Box::new(MockSandbox::new()));
    let result = executor
        .execute_mut("Hard question", "data", &config)
        .unwrap();

    assert!(result.trace.budget_exhausted.is_some());
    assert!(result.trace.iterations.len() <= 2);
}

/// RlmResult serializes to valid JSON with expected structure.
#[test]
fn result_serializes_to_json() {
    let mock = MockLlm::new(vec!["FINAL(42)"]);
    let config = default_config(Mode::Iterative);

    let mut executor = IterativeExecutor::new(&mock, Box::new(MockSandbox::new()));
    let result = executor.execute_mut("Compute", "data", &config).unwrap();

    let json = serde_json::to_string_pretty(&result).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

    assert_eq!(parsed["answer"], "42");
    assert_eq!(parsed["trace"]["mode"], "iterative");
    assert!(parsed["trace"]["iterations"].is_array());
    assert!(parsed["trace"]["usage"]["input_tokens"].is_number());
}

/// RlmResult serializes to valid YAML.
#[test]
fn result_serializes_to_yaml() {
    let mock = MockLlm::new(vec!["FINAL(hello world)"]);
    let config = default_config(Mode::Iterative);

    let mut executor = IterativeExecutor::new(&mock, Box::new(MockSandbox::new()));
    let result = executor.execute_mut("Task", "ctx", &config).unwrap();

    let yaml = serde_yaml::to_string(&result).unwrap();
    let parsed: RlmResult = serde_yaml::from_str(&yaml).unwrap();

    assert_eq!(parsed.answer, "hello world");
}

/// Full pipeline with template name set in config.
#[test]
fn pipeline_with_template_config() {
    let mock = MockLlm::new(vec!["FINAL(templated answer)"]);
    let mut config = default_config(Mode::Iterative);
    config.template = Some("academic-summary".into());

    let mut executor = IterativeExecutor::new(&mock, Box::new(MockSandbox::new()));
    let result = executor.execute_mut("Summarize", "paper text", &config).unwrap();

    assert_eq!(result.answer, "templated answer");
}
