use crate::types::*;

#[test]
fn mode_serde_round_trip() {
    let modes = vec![Mode::Direct, Mode::Iterative, Mode::Auto];
    for mode in modes {
        let json = serde_json::to_string(&mode).unwrap();
        let back: Mode = serde_json::from_str(&json).unwrap();
        assert_eq!(mode, back);
    }
}

#[test]
fn output_format_serde_round_trip() {
    let formats = vec![OutputFormat::Text, OutputFormat::Json, OutputFormat::Yaml];
    for fmt in formats {
        let json = serde_json::to_string(&fmt).unwrap();
        let back: OutputFormat = serde_json::from_str(&json).unwrap();
        assert_eq!(fmt, back);
    }
}

#[test]
fn inference_options_defaults_are_none() {
    let opts = InferenceOptions::default();
    assert!(opts.temperature.is_none());
    assert!(opts.top_p.is_none());
    assert!(opts.top_k.is_none());
    assert!(opts.max_tokens.is_none());
    assert!(opts.stop.is_none());
    assert!(opts.seed.is_none());
}

#[test]
fn inference_options_serde_round_trip() {
    let opts = InferenceOptions {
        temperature: Some(0.7),
        top_p: Some(0.9),
        top_k: Some(40),
        max_tokens: Some(4096),
        stop: Some(vec!["STOP".into()]),
        seed: Some(42),
    };
    let json = serde_json::to_string(&opts).unwrap();
    let back: InferenceOptions = serde_json::from_str(&json).unwrap();
    assert_eq!(back.temperature, Some(0.7));
    assert_eq!(back.seed, Some(42));
}

#[test]
fn budget_defaults() {
    let b = Budget::default();
    assert!(b.max_cost.is_none());
    assert!(b.max_tokens.is_none());
    assert_eq!(b.max_time_seconds, 300);
    assert_eq!(b.max_iterations, 50);
    assert_eq!(b.max_depth, 3);
    assert_eq!(b.max_batch_concurrency, 5);
}

#[test]
fn budget_serde_round_trip() {
    let b = Budget {
        max_cost: Some(1.50),
        max_tokens: Some(100_000),
        ..Budget::default()
    };
    let json = serde_json::to_string(&b).unwrap();
    let back: Budget = serde_json::from_str(&json).unwrap();
    assert_eq!(back.max_cost, Some(1.50));
    assert_eq!(back.max_tokens, Some(100_000));
}

#[test]
fn llm_request_serde_round_trip() {
    let req = LlmRequest {
        model: "claude-sonnet-4-20250514".into(),
        messages: vec![Message {
            role: "user".into(),
            content: "hello".into(),
        }],
        system: Some("You are helpful.".into()),
        inference: InferenceOptions::default(),
    };
    let json = serde_json::to_string(&req).unwrap();
    let back: LlmRequest = serde_json::from_str(&json).unwrap();
    assert_eq!(back.model, "claude-sonnet-4-20250514");
    assert_eq!(back.messages.len(), 1);
}

#[test]
fn llm_response_serde_round_trip() {
    let resp = LlmResponse {
        content: "Hello!".into(),
        usage: Usage {
            input_tokens: 10,
            output_tokens: 5,
            cost_usd: Some(0.001),
        },
    };
    let json = serde_json::to_string(&resp).unwrap();
    let back: LlmResponse = serde_json::from_str(&json).unwrap();
    assert_eq!(back.content, "Hello!");
    assert_eq!(back.usage.input_tokens, 10);
}

#[test]
fn rlm_result_serde_round_trip() {
    let result = RlmResult {
        answer: "The answer is 42.".into(),
        trace: ExecutionTrace {
            mode: Some(Mode::Iterative),
            iterations: vec![],
            usage: Usage::default(),
            budget_exhausted: None,
        },
        synthesis: None,
    };
    let json = serde_json::to_string(&result).unwrap();
    let back: RlmResult = serde_json::from_str(&json).unwrap();
    assert_eq!(back.answer, "The answer is 42.");
}

#[test]
fn provider_config_anthropic_serde() {
    let cfg = ProviderConfig::Anthropic {
        model: "claude-sonnet-4-20250514".into(),
        api_key_env: Some("ANTHROPIC_API_KEY".into()),
    };
    let json = serde_json::to_string(&cfg).unwrap();
    assert!(json.contains("\"type\":\"anthropic\""));
    let back: ProviderConfig = serde_json::from_str(&json).unwrap();
    assert_eq!(back.model(), "claude-sonnet-4-20250514");
}

#[test]
fn provider_config_openai_serde() {
    let cfg = ProviderConfig::OpenAi {
        model: "gpt-4o".into(),
        base_url: Some("https://api.openai.com/v1".into()),
        api_key_env: Some("OPENAI_API_KEY".into()),
    };
    let json = serde_json::to_string(&cfg).unwrap();
    assert!(json.contains("\"type\":\"openai\""));
}

#[test]
fn provider_config_claude_code_serde() {
    let cfg = ProviderConfig::ClaudeCode {
        model: "claude-opus-4-20250514".into(),
    };
    let json = serde_json::to_string(&cfg).unwrap();
    assert!(json.contains("\"type\":\"claude-code\""));
}

#[test]
fn sandbox_command_serde() {
    let cmd = SandboxCommand::Exec {
        code: "print(1+1)".into(),
    };
    let json = serde_json::to_string(&cmd).unwrap();
    assert!(json.contains("\"cmd\":\"exec\""));
    assert!(json.contains("print(1+1)"));
}

#[test]
fn sandbox_response_serde() {
    let resp = SandboxResponse {
        ok: true,
        stdout: "2\n".into(),
        stderr: String::new(),
        value: None,
        error: None,
        sub_calls: vec![],
    };
    let json = serde_json::to_string(&resp).unwrap();
    let back: SandboxResponse = serde_json::from_str(&json).unwrap();
    assert!(back.ok);
    assert_eq!(back.stdout, "2\n");
}

#[test]
fn profile_serde_round_trip() {
    let p = Profile {
        extends: Some("default".into()),
        provider: Some(ProviderConfig::Anthropic {
            model: "claude-sonnet-4-20250514".into(),
            api_key_env: None,
        }),
        mode: Some(Mode::Auto),
        ..Profile::default()
    };
    let yaml = serde_yaml::to_string(&p).unwrap();
    let back: Profile = serde_yaml::from_str(&yaml).unwrap();
    assert_eq!(back.extends.as_deref(), Some("default"));
}

#[test]
fn config_file_serde() {
    let yaml = r#"
profiles:
  default:
    provider:
      type: anthropic
      model: claude-sonnet-4-20250514
    mode: auto
  fast:
    extends: default
    inference:
      temperature: 0.0
"#;
    let cfg: RlmConfigFile = serde_yaml::from_str(yaml).unwrap();
    assert_eq!(cfg.profiles.len(), 2);
    assert!(cfg.profiles.contains_key("default"));
    assert!(cfg.profiles.contains_key("fast"));
}

#[test]
fn template_serde() {
    let yaml = r#"
name: academic-summary
description: Summarize an academic paper
mode: iterative
systemPrompt: Analyze this paper
synthesize: true
"#;
    let t: PromptTemplate = serde_yaml::from_str(yaml).unwrap();
    assert_eq!(t.name, "academic-summary");
    assert_eq!(t.mode, Some(Mode::Iterative));
    assert_eq!(t.synthesize, Some(true));
}

#[test]
fn model_context_limits() {
    assert_eq!(model_context_limit("claude-sonnet-4-20250514"), 200_000);
    assert_eq!(model_context_limit("gpt-4o-mini"), 128_000);
    assert_eq!(model_context_limit("llama3"), 8_192);
    assert_eq!(model_context_limit("unknown-model"), 128_000);
}

#[test]
fn estimate_tokens_basic() {
    assert_eq!(estimate_tokens(""), 0);
    assert_eq!(estimate_tokens("abcd"), 1);
    assert_eq!(estimate_tokens("a".repeat(400).as_str()), 100);
}

#[test]
fn budget_exhausted_reason_serde() {
    let r = BudgetExhaustedReason::CostExceeded;
    let json = serde_json::to_string(&r).unwrap();
    assert_eq!(json, "\"cost_exceeded\"");
    let back: BudgetExhaustedReason = serde_json::from_str(&json).unwrap();
    assert_eq!(back, BudgetExhaustedReason::CostExceeded);
}

#[test]
fn execution_trace_serde() {
    let trace = ExecutionTrace {
        mode: Some(Mode::Iterative),
        iterations: vec![Iteration {
            index: 0,
            llm_response: "Let me check...".into(),
            code_executions: vec![CodeExecution {
                code: "print(len(context))".into(),
                stdout: "1234\n".into(),
                stderr: String::new(),
                error: None,
                duration_ms: 50,
            }],
            sub_calls: vec![],
        }],
        usage: Usage {
            input_tokens: 100,
            output_tokens: 50,
            cost_usd: None,
        },
        budget_exhausted: None,
    };
    let json = serde_json::to_string(&trace).unwrap();
    let back: ExecutionTrace = serde_json::from_str(&json).unwrap();
    assert_eq!(back.iterations.len(), 1);
    assert_eq!(back.iterations[0].code_executions.len(), 1);
}
