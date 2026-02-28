use crate::cli::{
    build_cli_overrides, format_result, load_resolved_config, parse_mode_str,
    parse_output_format, resolve_config, resolve_effective_mode,
};
use crate::config::CliOverrides;
use crate::types::{
    ExecutionTrace, Mode, OutputFormat, ProviderConfig, RlmConfigFile, RlmResult, Usage,
};

// ── parse_mode_str ──────────────────────────────────────────────────────────

#[test]
fn parse_mode_str_direct() {
    assert_eq!(parse_mode_str("direct"), Mode::Direct);
}

#[test]
fn parse_mode_str_iterative() {
    assert_eq!(parse_mode_str("iterative"), Mode::Iterative);
}

#[test]
fn parse_mode_str_auto() {
    assert_eq!(parse_mode_str("auto"), Mode::Auto);
}

#[test]
fn parse_mode_str_unknown_defaults_to_auto() {
    assert_eq!(parse_mode_str("unknown"), Mode::Auto);
    assert_eq!(parse_mode_str(""), Mode::Auto);
}

// ── parse_output_format ─────────────────────────────────────────────────────

#[test]
fn parse_output_format_json() {
    assert_eq!(parse_output_format("json"), OutputFormat::Json);
}

#[test]
fn parse_output_format_yaml() {
    assert_eq!(parse_output_format("yaml"), OutputFormat::Yaml);
}

#[test]
fn parse_output_format_text() {
    assert_eq!(parse_output_format("text"), OutputFormat::Text);
}

#[test]
fn parse_output_format_unknown_defaults_to_text() {
    assert_eq!(parse_output_format("xml"), OutputFormat::Text);
    assert_eq!(parse_output_format(""), OutputFormat::Text);
}

// ── resolve_effective_mode ──────────────────────────────────────────────────

#[test]
fn resolve_effective_mode_iterative_claude_code_downgrades() {
    let provider = ProviderConfig::ClaudeCode {
        model: "test".into(),
    };
    let (mode, downgraded) = resolve_effective_mode(Mode::Iterative, &provider);
    assert_eq!(mode, Mode::Direct);
    assert!(downgraded);
}

#[test]
fn resolve_effective_mode_direct_claude_code_no_change() {
    let provider = ProviderConfig::ClaudeCode {
        model: "test".into(),
    };
    let (mode, downgraded) = resolve_effective_mode(Mode::Direct, &provider);
    assert_eq!(mode, Mode::Direct);
    assert!(!downgraded);
}

#[test]
fn resolve_effective_mode_iterative_anthropic_no_change() {
    let provider = ProviderConfig::Anthropic {
        model: "test".into(),
        api_key_env: None,
    };
    let (mode, downgraded) = resolve_effective_mode(Mode::Iterative, &provider);
    assert_eq!(mode, Mode::Iterative);
    assert!(!downgraded);
}

#[test]
fn resolve_effective_mode_auto_claude_code_no_change() {
    let provider = ProviderConfig::ClaudeCode {
        model: "test".into(),
    };
    let (mode, downgraded) = resolve_effective_mode(Mode::Auto, &provider);
    assert_eq!(mode, Mode::Auto);
    assert!(!downgraded);
}

#[test]
fn resolve_effective_mode_iterative_openai_no_change() {
    let provider = ProviderConfig::OpenAi {
        model: "gpt-4o".into(),
        base_url: None,
        api_key_env: None,
    };
    let (mode, downgraded) = resolve_effective_mode(Mode::Iterative, &provider);
    assert_eq!(mode, Mode::Iterative);
    assert!(!downgraded);
}

// ── format_result ───────────────────────────────────────────────────────────

fn make_result(answer: &str, synthesis: Option<&str>) -> RlmResult {
    RlmResult {
        answer: answer.to_string(),
        trace: ExecutionTrace::default(),
        synthesis: synthesis.map(String::from),
    }
}

#[test]
fn format_result_text_without_synthesis() {
    let result = make_result("Hello world", None);
    let output = format_result(&result, OutputFormat::Text).unwrap();
    assert_eq!(output, "Hello world");
}

#[test]
fn format_result_text_with_synthesis() {
    let result = make_result("answer", Some("synthesized"));
    let output = format_result(&result, OutputFormat::Text).unwrap();
    assert!(output.contains("answer"));
    assert!(output.contains("--- Synthesis ---"));
    assert!(output.contains("synthesized"));
}

#[test]
fn format_result_json() {
    let result = make_result("test answer", None);
    let output = format_result(&result, OutputFormat::Json).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&output).unwrap();
    assert_eq!(parsed["answer"], "test answer");
}

#[test]
fn format_result_yaml() {
    let result = make_result("yaml answer", None);
    let output = format_result(&result, OutputFormat::Yaml).unwrap();
    assert!(output.contains("yaml answer"));
    // YAML should parse back
    let parsed: serde_yaml::Value = serde_yaml::from_str(&output).unwrap();
    assert_eq!(
        parsed["answer"].as_str().unwrap(),
        "yaml answer"
    );
}

#[test]
fn format_result_json_includes_trace() {
    let result = RlmResult {
        answer: "done".into(),
        trace: ExecutionTrace {
            mode: Some(Mode::Direct),
            iterations: vec![],
            usage: Usage {
                input_tokens: 100,
                output_tokens: 50,
                cost_usd: Some(0.01),
            },
            budget_exhausted: None,
        },
        synthesis: None,
    };
    let output = format_result(&result, OutputFormat::Json).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&output).unwrap();
    assert_eq!(parsed["trace"]["usage"]["input_tokens"], 100);
}

// ── build_cli_overrides ─────────────────────────────────────────────────────

#[test]
fn build_cli_overrides_all_none() {
    let overrides = build_cli_overrides(None, None, false);
    assert!(overrides.mode.is_none());
    assert!(overrides.template.is_none());
    assert!(overrides.synthesize.is_none());
    assert!(overrides.provider.is_none());
}

#[test]
fn build_cli_overrides_with_mode() {
    let overrides = build_cli_overrides(Some("direct"), None, false);
    assert_eq!(overrides.mode, Some(Mode::Direct));
}

#[test]
fn build_cli_overrides_with_template() {
    let overrides = build_cli_overrides(None, Some("my-template"), false);
    assert_eq!(overrides.template, Some("my-template".into()));
}

#[test]
fn build_cli_overrides_synthesize_true() {
    let overrides = build_cli_overrides(None, None, true);
    assert_eq!(overrides.synthesize, Some(true));
}

#[test]
fn build_cli_overrides_synthesize_false_is_none() {
    let overrides = build_cli_overrides(None, None, false);
    assert!(overrides.synthesize.is_none());
}

// ── resolve_config ──────────────────────────────────────────────────────────

#[test]
fn resolve_config_no_file_uses_anthropic_defaults() {
    let overrides = CliOverrides::default();
    let config = resolve_config(None, None, &overrides).unwrap();
    assert_eq!(config.provider.model(), "claude-sonnet-4-20250514");
    assert_eq!(config.mode, Mode::Auto);
    assert!(!config.synthesize);
}

#[test]
fn resolve_config_no_file_with_mode_override() {
    let overrides = build_cli_overrides(Some("iterative"), None, false);
    let config = resolve_config(None, None, &overrides).unwrap();
    assert_eq!(config.mode, Mode::Iterative);
}

#[test]
fn resolve_config_no_file_with_synthesize() {
    let overrides = build_cli_overrides(None, None, true);
    let config = resolve_config(None, None, &overrides).unwrap();
    assert!(config.synthesize);
}

#[test]
fn resolve_config_no_file_with_template() {
    let overrides = build_cli_overrides(None, Some("academic-summary"), false);
    let config = resolve_config(None, None, &overrides).unwrap();
    assert_eq!(config.template, Some("academic-summary".into()));
}

#[test]
fn resolve_config_with_config_file_and_profile() {
    let cfg: RlmConfigFile = serde_yaml::from_str(
        r#"
profiles:
  myprofile:
    provider:
      type: anthropic
      model: test-model-42
    mode: direct
"#,
    )
    .unwrap();
    let overrides = CliOverrides::default();
    let config = resolve_config(Some(&cfg), Some("myprofile"), &overrides).unwrap();
    assert_eq!(config.provider.model(), "test-model-42");
    assert_eq!(config.mode, Mode::Direct);
}

#[test]
fn resolve_config_single_profile_auto_selected() {
    let cfg: RlmConfigFile = serde_yaml::from_str(
        r#"
profiles:
  only-one:
    provider:
      type: openai
      model: gpt-4o
"#,
    )
    .unwrap();
    let overrides = CliOverrides::default();
    // No profile name given, but only one profile exists → auto-selected
    let config = resolve_config(Some(&cfg), None, &overrides).unwrap();
    assert_eq!(config.provider.model(), "gpt-4o");
}

#[test]
fn resolve_config_multi_profile_defaults_to_default_key() {
    let cfg: RlmConfigFile = serde_yaml::from_str(
        r#"
profiles:
  default:
    provider:
      type: anthropic
      model: default-model
  other:
    provider:
      type: openai
      model: other-model
"#,
    )
    .unwrap();
    let overrides = CliOverrides::default();
    let config = resolve_config(Some(&cfg), None, &overrides).unwrap();
    assert_eq!(config.provider.model(), "default-model");
}

#[test]
fn resolve_config_overrides_take_precedence_over_profile() {
    let cfg: RlmConfigFile = serde_yaml::from_str(
        r#"
profiles:
  default:
    provider:
      type: anthropic
      model: test
    mode: auto
"#,
    )
    .unwrap();
    let overrides = build_cli_overrides(Some("direct"), Some("my-template"), true);
    let config = resolve_config(Some(&cfg), Some("default"), &overrides).unwrap();
    assert_eq!(config.mode, Mode::Direct);
    assert_eq!(config.template, Some("my-template".into()));
    assert!(config.synthesize);
}

// ── load_resolved_config (integration with file loading) ────────────────────

#[test]
fn load_resolved_config_errors_on_missing_file() {
    let dir = tempfile::tempdir().unwrap();
    let bogus = dir.path().join("nonexistent.yaml");
    let err = load_resolved_config(Some(&bogus), None, None, None, false);
    assert!(err.is_err(), "Should error on missing explicit config path");
}

#[test]
fn load_resolved_config_from_explicit_yaml() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join(".rlmrc.yaml");
    std::fs::write(
        &path,
        r#"
profiles:
  myprofile:
    provider:
      type: anthropic
      model: test-model-42
    mode: direct
"#,
    )
    .unwrap();

    let config = load_resolved_config(
        Some(&path),
        Some("myprofile"),
        None,
        None,
        false,
    )
    .unwrap();

    assert_eq!(config.provider.model(), "test-model-42");
    assert_eq!(config.mode, Mode::Direct);
}

#[test]
fn load_resolved_config_mode_override() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join(".rlmrc.yaml");
    std::fs::write(
        &path,
        r#"
profiles:
  default:
    provider:
      type: anthropic
      model: test-model
    mode: auto
"#,
    )
    .unwrap();

    let config = load_resolved_config(
        Some(&path),
        Some("default"),
        Some("iterative"),
        None,
        false,
    )
    .unwrap();

    assert_eq!(config.mode, Mode::Iterative);
}

#[test]
fn load_resolved_config_mode_str_variants() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join(".rlmrc.yaml");
    std::fs::write(
        &path,
        r#"
profiles:
  default:
    provider:
      type: anthropic
      model: test
"#,
    )
    .unwrap();

    let config = load_resolved_config(Some(&path), Some("default"), Some("direct"), None, false).unwrap();
    assert_eq!(config.mode, Mode::Direct);

    let config = load_resolved_config(Some(&path), Some("default"), Some("iterative"), None, false).unwrap();
    assert_eq!(config.mode, Mode::Iterative);

    let config = load_resolved_config(Some(&path), Some("default"), Some("auto"), None, false).unwrap();
    assert_eq!(config.mode, Mode::Auto);

    let config = load_resolved_config(Some(&path), Some("default"), Some("banana"), None, false).unwrap();
    assert_eq!(config.mode, Mode::Auto);
}
