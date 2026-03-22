use std::collections::HashMap;

use crate::config::{build_config, load_config_file, resolve_profile, display_config, CliOverrides};
use crate::types::{Budget, InferenceOptions, Mode, ProviderConfig, RlmConfig, RlmConfigFile};

use super::fixtures::make_config_file;

#[test]
fn resolve_base_profile() {
    let cfg = make_config_file();
    let profile = resolve_profile(&cfg, "base").unwrap();
    assert!(profile.provider.is_some());
    assert_eq!(profile.provider.unwrap().model(), "claude-sonnet-4-20250514");
    assert_eq!(profile.mode, Some(Mode::Auto));
}

#[test]
fn resolve_extended_profile_overrides_model() {
    let cfg = make_config_file();
    let profile = resolve_profile(&cfg, "research").unwrap();
    assert_eq!(profile.provider.unwrap().model(), "claude-opus-4-20250514");
    // Budget should be overridden
    let budget = profile.budget.unwrap();
    assert_eq!(budget.max_cost, Some(10.0));
    assert_eq!(budget.max_iterations, 100);
    // Mode inherited from base
    assert_eq!(profile.mode, Some(Mode::Auto));
}

#[test]
fn resolve_extended_profile_deep_merges_inference() {
    let cfg = make_config_file();
    let profile = resolve_profile(&cfg, "fast").unwrap();
    let inference = profile.inference.unwrap();
    assert_eq!(inference.temperature, Some(0.0));
    assert_eq!(inference.seed, Some(42));
}

#[test]
fn resolve_nonexistent_profile_errors() {
    let cfg = make_config_file();
    let result = resolve_profile(&cfg, "nonexistent");
    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("not found"));
}

#[test]
fn circular_extends_detected() {
    let yaml = r#"
profiles:
  a:
    extends: b
    provider:
      type: anthropic
      model: test
  b:
    extends: a
    provider:
      type: anthropic
      model: test
"#;
    let cfg: RlmConfigFile = serde_yaml::from_str(yaml).unwrap();
    let result = resolve_profile(&cfg, "a");
    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("Circular"));
}

#[test]
fn build_config_from_profile() {
    let cfg = make_config_file();
    let profile = resolve_profile(&cfg, "base").unwrap();
    let overrides = CliOverrides::default();
    let resolved = build_config(&profile, &overrides).unwrap();
    assert_eq!(resolved.provider.model(), "claude-sonnet-4-20250514");
    assert_eq!(resolved.mode, Mode::Auto);
    assert!(!resolved.synthesize);
}

#[test]
fn cli_overrides_take_precedence() {
    let cfg = make_config_file();
    let profile = resolve_profile(&cfg, "base").unwrap();
    let overrides = CliOverrides {
        mode: Some(Mode::Direct),
        synthesize: Some(true),
        ..Default::default()
    };
    let resolved = build_config(&profile, &overrides).unwrap();
    assert_eq!(resolved.mode, Mode::Direct);
    assert!(resolved.synthesize);
}

#[test]
fn build_config_no_provider_errors() {
    let profile = crate::types::Profile::default();
    let overrides = CliOverrides::default();
    let result = build_config(&profile, &overrides);
    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("No provider"));
}

#[test]
fn display_config_includes_key_fields() {
    let config = RlmConfig {
        provider: ProviderConfig::Anthropic {
            model: "test-model".into(),
            api_key_env: None,
        },
        subcall_provider: None,
        inference: InferenceOptions {
            temperature: Some(0.5),
            ..InferenceOptions::default()
        },
        budget: Budget {
            max_cost: Some(5.0),
            ..Budget::default()
        },
        mode: Mode::Auto,
        template: Some("academic-summary".into()),
        synthesize: true,
        model_hints: HashMap::new(),
        templates_dir: None,
    };
    let out = display_config(&config);
    assert!(out.contains("test-model"));
    assert!(out.contains("Auto"));
    assert!(out.contains("academic-summary"));
    assert!(out.contains("$5.00"));
    assert!(out.contains("Temperature: 0.5"));
}

#[test]
fn config_file_round_trip_yaml() {
    let yaml = r#"
profiles:
  default:
    provider:
      type: anthropic
      model: claude-sonnet-4-20250514
    mode: auto
    budget:
      max_cost: 5.0
      max_iterations: 50
      max_time_seconds: 300
      max_depth: 3
      max_batch_concurrency: 5
"#;
    let cfg: RlmConfigFile = serde_yaml::from_str(yaml).unwrap();
    assert_eq!(cfg.profiles.len(), 1);
    let profile = &cfg.profiles["default"];
    assert_eq!(profile.mode, Some(Mode::Auto));
}

#[test]
fn load_config_from_explicit_path() {
    // Create a temp config file
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join(".rlmrc.yaml");
    std::fs::write(
        &path,
        r#"
profiles:
  test:
    provider:
      type: anthropic
      model: test-model
"#,
    )
    .unwrap();

    let result = load_config_file(Some(&path), None).unwrap();
    assert!(result.is_some());
    let (cfg, found_path) = result.unwrap();
    assert_eq!(found_path, path);
    assert!(cfg.profiles.contains_key("test"));
}

#[test]
fn load_config_not_found() {
    let dir = tempfile::tempdir().unwrap();
    let result = load_config_file(None, Some(dir.path())).unwrap();
    assert!(result.is_none());
}

#[test]
fn load_config_from_json_file() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join(".rlmrc.json");
    std::fs::write(
        &path,
        r#"{
            "profiles": {
                "default": {
                    "provider": {
                        "type": "anthropic",
                        "model": "claude-sonnet-4-20250514"
                    },
                    "mode": "direct",
                    "budget": {
                        "max_cost": 3.0,
                        "max_iterations": 25,
                        "max_time_seconds": 120,
                        "max_depth": 2,
                        "max_batch_concurrency": 3
                    }
                }
            }
        }"#,
    )
    .unwrap();

    let result = load_config_file(Some(&path), None).unwrap();
    assert!(result.is_some());
    let (cfg, found_path) = result.unwrap();
    assert_eq!(found_path, path);
    assert!(cfg.profiles.contains_key("default"));
    let profile = &cfg.profiles["default"];
    assert_eq!(profile.mode, Some(Mode::Direct));
    let budget = profile.budget.as_ref().unwrap();
    assert_eq!(budget.max_cost, Some(3.0));
    assert_eq!(budget.max_iterations, 25);
}

#[test]
fn load_config_json_auto_detected_by_search() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join(".rlmrc.json");
    std::fs::write(
        &path,
        r#"{"profiles":{"test":{"provider":{"type":"openai","model":"gpt-4o"}}}}"#,
    )
    .unwrap();

    let result = load_config_file(None, Some(dir.path())).unwrap();
    assert!(result.is_some());
    let (cfg, found_path) = result.unwrap();
    assert_eq!(found_path, path);
    assert!(cfg.profiles.contains_key("test"));
}

#[test]
fn merge_profile_with_all_none_source_preserves_target() {
    let cfg_yaml = r#"
profiles:
  base:
    provider:
      type: anthropic
      model: claude-sonnet-4-20250514
    mode: iterative
    budget:
      max_cost: 5.0
      max_iterations: 50
      max_time_seconds: 300
      max_depth: 3
      max_batch_concurrency: 5
  empty:
    extends: base
"#;
    let cfg: RlmConfigFile = serde_yaml::from_str(cfg_yaml).unwrap();
    let profile = resolve_profile(&cfg, "empty").unwrap();

    // All values should come from base since empty has no overrides
    assert_eq!(profile.provider.unwrap().model(), "claude-sonnet-4-20250514");
    assert_eq!(profile.mode, Some(Mode::Iterative));
    let budget = profile.budget.unwrap();
    assert_eq!(budget.max_cost, Some(5.0));
    assert_eq!(budget.max_iterations, 50);
}

#[test]
fn build_config_with_no_cli_overrides() {
    let cfg = make_config_file();
    let profile = resolve_profile(&cfg, "base").unwrap();
    let overrides = CliOverrides {
        provider: None,
        mode: None,
        template: None,
        synthesize: None,
    };
    let resolved = build_config(&profile, &overrides).unwrap();
    // All values come from profile, none from overrides
    assert_eq!(resolved.provider.model(), "claude-sonnet-4-20250514");
    assert_eq!(resolved.mode, Mode::Auto);
    assert!(!resolved.synthesize);
    assert!(resolved.template.is_none());
}

// ── display_config coverage ─────────────────────────────────────────────────

#[test]
fn display_config_with_top_p_and_top_k() {
    let config = RlmConfig {
        provider: ProviderConfig::Anthropic {
            model: "test-model".into(),
            api_key_env: None,
        },
        subcall_provider: None,
        inference: InferenceOptions {
            temperature: Some(0.7),
            top_p: Some(0.9),
            top_k: Some(40),
            ..InferenceOptions::default()
        },
        budget: Budget {
            max_tokens: Some(100_000),
            ..Budget::default()
        },
        mode: Mode::Direct,
        template: None,
        synthesize: false,
        model_hints: HashMap::new(),
        templates_dir: None,
    };
    let out = display_config(&config);
    assert!(out.contains("Top-p: 0.9"), "Expected top_p in output: {}", out);
    assert!(out.contains("Top-k: 40"), "Expected top_k in output: {}", out);
    assert!(out.contains("Temperature: 0.7"), "Expected temperature in output: {}", out);
    assert!(out.contains("Max tokens: 100000"), "Expected max_tokens in output: {}", out);
    assert!(out.contains("Direct"), "Expected mode in output: {}", out);
    // No template set — should not appear
    assert!(!out.contains("Template:"), "Template should not appear when None: {}", out);
}

#[test]
fn display_config_without_inference_options() {
    let config = RlmConfig {
        provider: ProviderConfig::Anthropic {
            model: "test".into(),
            api_key_env: None,
        },
        subcall_provider: None,
        inference: InferenceOptions::default(),
        budget: Budget::default(),
        mode: Mode::Auto,
        template: None,
        synthesize: false,
        model_hints: HashMap::new(),
        templates_dir: None,
    };
    let out = display_config(&config);
    // Should NOT contain inference section since all are None
    assert!(!out.contains("Inference:"), "Should skip inference section when all None: {}", out);
}

// ── load_config_file upward search ──────────────────────────────────────────

#[test]
fn load_config_file_searches_upward() {
    let dir = tempfile::tempdir().unwrap();
    // Create config in parent dir
    let config_path = dir.path().join(".rlmrc.yaml");
    std::fs::write(
        &config_path,
        "profiles:\n  found:\n    provider:\n      type: anthropic\n      model: test\n",
    )
    .unwrap();

    // Create a subdirectory to search from
    let sub = dir.path().join("sub").join("deep");
    std::fs::create_dir_all(&sub).unwrap();

    let result = load_config_file(None, Some(&sub)).unwrap();
    assert!(result.is_some(), "Should find config by searching upward");
    let (cfg, found) = result.unwrap();
    assert!(cfg.profiles.contains_key("found"));
    assert_eq!(found, config_path);
}

#[test]
fn load_config_file_json_in_search() {
    let dir = tempfile::tempdir().unwrap();
    // Place a .rlmrc.json in the search path
    let config_path = dir.path().join(".rlmrc.json");
    std::fs::write(
        &config_path,
        r#"{"profiles":{"jsontest":{"provider":{"type":"anthropic","model":"test"}}}}"#,
    )
    .unwrap();

    let sub = dir.path().join("child");
    std::fs::create_dir_all(&sub).unwrap();

    let result = load_config_file(None, Some(&sub)).unwrap();
    assert!(result.is_some());
    let (cfg, found) = result.unwrap();
    assert!(cfg.profiles.contains_key("jsontest"));
    assert_eq!(found, config_path);
}

// ── merge_profile deep merge budget edge cases ──────────────────────────────

#[test]
fn merge_profile_budget_fields_all_override() {
    let yaml = r#"
profiles:
  base:
    provider:
      type: anthropic
      model: test
    budget:
      max_cost: 1.0
      max_tokens: 1000
      max_iterations: 10
      max_time_seconds: 60
      max_depth: 2
      max_batch_concurrency: 3
  child:
    extends: base
    budget:
      max_cost: 5.0
      max_tokens: 5000
      max_iterations: 50
      max_time_seconds: 300
      max_depth: 5
      max_batch_concurrency: 10
"#;
    let cfg: RlmConfigFile = serde_yaml::from_str(yaml).unwrap();
    let profile = resolve_profile(&cfg, "child").unwrap();
    let budget = profile.budget.unwrap();
    assert_eq!(budget.max_cost, Some(5.0));
    assert_eq!(budget.max_tokens, Some(5000));
    assert_eq!(budget.max_iterations, 50);
    assert_eq!(budget.max_time_seconds, 300);
    assert_eq!(budget.max_depth, 5);
    assert_eq!(budget.max_batch_concurrency, 10);
}

#[test]
fn merge_profile_synthesize_and_model_hints() {
    let yaml = r#"
profiles:
  base:
    provider:
      type: anthropic
      model: test
    synthesize: false
    model_hints:
      test: "hint for test"
  child:
    extends: base
    synthesize: true
"#;
    let cfg: RlmConfigFile = serde_yaml::from_str(yaml).unwrap();
    let profile = resolve_profile(&cfg, "child").unwrap();
    assert_eq!(profile.synthesize, Some(true));
    // model_hints from base since child doesn't override
    assert!(profile.model_hints.is_some());
    assert!(profile.model_hints.unwrap().contains_key("test"));
}

#[test]
fn merge_profile_subcall_provider_override() {
    let yaml = r#"
profiles:
  base:
    provider:
      type: anthropic
      model: test
  child:
    extends: base
    subcall_provider:
      type: openai
      model: gpt-4o
"#;
    let cfg: RlmConfigFile = serde_yaml::from_str(yaml).unwrap();
    let profile = resolve_profile(&cfg, "child").unwrap();
    assert!(profile.subcall_provider.is_some());
    assert_eq!(profile.subcall_provider.unwrap().model(), "gpt-4o");
}

#[test]
fn merge_profile_template_override() {
    let yaml = r#"
profiles:
  base:
    provider:
      type: anthropic
      model: test
    template: base-template
  child:
    extends: base
    template: child-template
"#;
    let cfg: RlmConfigFile = serde_yaml::from_str(yaml).unwrap();
    let profile = resolve_profile(&cfg, "child").unwrap();
    assert_eq!(profile.template, Some("child-template".into()));
}

#[test]
fn merge_profile_inference_stop_and_seed_override() {
    let yaml = r#"
profiles:
  base:
    provider:
      type: anthropic
      model: test
    inference:
      temperature: 0.5
      max_tokens: 1000
      stop: ["END"]
  child:
    extends: base
    inference:
      max_tokens: 2000
      stop: ["STOP", "END"]
      seed: 99
"#;
    let cfg: RlmConfigFile = serde_yaml::from_str(yaml).unwrap();
    let profile = resolve_profile(&cfg, "child").unwrap();
    let inf = profile.inference.unwrap();
    assert_eq!(inf.temperature, Some(0.5)); // inherited from base
    assert_eq!(inf.max_tokens, Some(2000)); // overridden
    assert_eq!(inf.stop, Some(vec!["STOP".into(), "END".into()])); // overridden
    assert_eq!(inf.seed, Some(99)); // new in child
}

#[test]
fn merge_profile_inference_top_p_and_top_k() {
    let yaml = r#"
profiles:
  base:
    provider:
      type: anthropic
      model: test
    inference:
      temperature: 0.5
  child:
    extends: base
    inference:
      top_p: 0.9
      top_k: 40
"#;
    let cfg: RlmConfigFile = serde_yaml::from_str(yaml).unwrap();
    let profile = resolve_profile(&cfg, "child").unwrap();
    let inf = profile.inference.unwrap();
    assert_eq!(inf.temperature, Some(0.5)); // inherited
    assert_eq!(inf.top_p, Some(0.9)); // from child
    assert_eq!(inf.top_k, Some(40)); // from child
}
