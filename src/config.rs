use std::path::{Path, PathBuf};

use anyhow::{bail, Result};

use crate::types::{
    Budget, InferenceOptions, Mode, Profile, ProviderConfig, RlmConfig, RlmConfigFile,
};

/// Search places for config file, in priority order.
const CONFIG_NAMES: &[&str] = &[
    ".rlmrc.yaml",
    ".rlmrc.yml",
    ".rlmrc.json",
    ".config/rlm/config.yaml",
    ".config/rlm/config.json",
];

/// Load config file from an explicit path or by searching upward from `search_from`.
pub fn load_config_file(path: Option<&Path>, search_from: Option<&Path>) -> Result<Option<(RlmConfigFile, PathBuf)>> {
    if let Some(p) = path {
        let contents = std::fs::read_to_string(p)?;
        let cfg: RlmConfigFile = if p.extension().is_some_and(|e| e == "json") {
            serde_json::from_str(&contents)?
        } else {
            serde_yaml::from_str(&contents)?
        };
        return Ok(Some((cfg, p.to_path_buf())));
    }

    let start = search_from
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));

    let mut dir = start.as_path();
    loop {
        for name in CONFIG_NAMES {
            let candidate = dir.join(name);
            if candidate.is_file() {
                let contents = std::fs::read_to_string(&candidate)?;
                let cfg: RlmConfigFile = if candidate.extension().is_some_and(|e| e == "json") {
                    serde_json::from_str(&contents)?
                } else {
                    serde_yaml::from_str(&contents)?
                };
                return Ok(Some((cfg, candidate)));
            }
        }
        match dir.parent() {
            Some(parent) => dir = parent,
            None => return Ok(None),
        }
    }
}

/// Resolve a profile by name from the config file, handling `extends` inheritance.
pub fn resolve_profile(
    config: &RlmConfigFile,
    profile_name: &str,
) -> Result<Profile> {
    let mut chain = Vec::new();
    let mut current_name = profile_name.to_string();

    // Walk the extends chain, collecting profiles bottom-up
    loop {
        if chain.iter().any(|(n, _): &(String, Profile)| *n == current_name) {
            bail!("Circular extends detected: {} -> {}", profile_name, current_name);
        }

        let profile = config
            .profiles
            .get(&current_name)
            .ok_or_else(|| anyhow::anyhow!("Profile '{}' not found", current_name))?
            .clone();

        let extends = profile.extends.clone();
        chain.push((current_name.clone(), profile));

        match extends {
            Some(parent) => current_name = parent,
            None => break,
        }
    }

    // Merge from base (last in chain) to child (first in chain)
    chain.reverse();
    let mut merged = Profile::default();
    for (_, profile) in chain {
        merge_profile(&mut merged, &profile);
    }

    Ok(merged)
}

/// Merge `source` profile into `target`, overriding non-None fields.
fn merge_profile(target: &mut Profile, source: &Profile) {
    if source.provider.is_some() {
        target.provider = source.provider.clone();
    }
    if source.subcall_provider.is_some() {
        target.subcall_provider = source.subcall_provider.clone();
    }
    if source.mode.is_some() {
        target.mode = source.mode;
    }
    if source.template.is_some() {
        target.template = source.template.clone();
    }
    if source.synthesize.is_some() {
        target.synthesize = source.synthesize;
    }
    if source.model_hints.is_some() {
        target.model_hints = source.model_hints.clone();
    }

    // Deep merge inference
    if let Some(ref src_inf) = source.inference {
        let dst = target.inference.get_or_insert_with(InferenceOptions::default);
        if src_inf.temperature.is_some() {
            dst.temperature = src_inf.temperature;
        }
        if src_inf.top_p.is_some() {
            dst.top_p = src_inf.top_p;
        }
        if src_inf.top_k.is_some() {
            dst.top_k = src_inf.top_k;
        }
        if src_inf.max_tokens.is_some() {
            dst.max_tokens = src_inf.max_tokens;
        }
        if src_inf.stop.is_some() {
            dst.stop = src_inf.stop.clone();
        }
        if src_inf.seed.is_some() {
            dst.seed = src_inf.seed;
        }
    }

    // Deep merge budget
    if let Some(ref src_budget) = source.budget {
        let dst = target.budget.get_or_insert_with(Budget::default);
        if src_budget.max_cost.is_some() {
            dst.max_cost = src_budget.max_cost;
        }
        if src_budget.max_tokens.is_some() {
            dst.max_tokens = src_budget.max_tokens;
        }
        // Always override non-Option fields from source budget if source provides them
        dst.max_time_seconds = src_budget.max_time_seconds;
        dst.max_iterations = src_budget.max_iterations;
        dst.max_depth = src_budget.max_depth;
        dst.max_batch_concurrency = src_budget.max_batch_concurrency;
    }
}

/// Build a resolved `RlmConfig` from a profile, with CLI overrides applied.
pub fn build_config(profile: &Profile, overrides: &CliOverrides) -> Result<RlmConfig> {
    let provider = overrides
        .provider
        .clone()
        .or_else(|| profile.provider.clone())
        .ok_or_else(|| anyhow::anyhow!("No provider configured"))?;

    let mode = overrides.mode.unwrap_or_else(|| {
        profile.mode.unwrap_or_default()
    });

    let inference = profile.inference.clone().unwrap_or_default();
    let budget = profile.budget.clone().unwrap_or_default();
    let template = overrides.template.clone().or_else(|| profile.template.clone());
    let synthesize = overrides.synthesize.unwrap_or_else(|| {
        profile.synthesize.unwrap_or(false)
    });

    Ok(RlmConfig {
        provider,
        subcall_provider: profile.subcall_provider.clone(),
        inference,
        budget,
        mode,
        template,
        synthesize,
        model_hints: profile.model_hints.clone().unwrap_or_default(),
        templates_dir: None,
    })
}

/// CLI overrides that take precedence over config file values.
#[derive(Debug, Clone, Default)]
pub struct CliOverrides {
    pub provider: Option<ProviderConfig>,
    pub mode: Option<Mode>,
    pub template: Option<String>,
    pub synthesize: Option<bool>,
}

/// Display a resolved config in human-readable format.
pub fn display_config(config: &RlmConfig) -> String {
    let mut out = String::new();
    out.push_str("RLM Configuration\n");
    out.push_str("=================\n\n");

    out.push_str(&format!("Provider: {:?}\n", config.provider));
    out.push_str(&format!("Model: {}\n", config.provider.model()));
    out.push_str(&format!("Mode: {:?}\n", config.mode));
    out.push_str(&format!("Synthesize: {}\n", config.synthesize));

    if let Some(ref t) = config.template {
        out.push_str(&format!("Template: {}\n", t));
    }

    out.push_str("\nBudget:\n");
    if let Some(cost) = config.budget.max_cost {
        out.push_str(&format!("  Max cost: ${:.2}\n", cost));
    }
    if let Some(tokens) = config.budget.max_tokens {
        out.push_str(&format!("  Max tokens: {}\n", tokens));
    }
    out.push_str(&format!("  Max time: {}s\n", config.budget.max_time_seconds));
    out.push_str(&format!("  Max iterations: {}\n", config.budget.max_iterations));
    out.push_str(&format!("  Max depth: {}\n", config.budget.max_depth));

    if config.inference.temperature.is_some()
        || config.inference.top_p.is_some()
        || config.inference.top_k.is_some()
    {
        out.push_str("\nInference:\n");
        if let Some(t) = config.inference.temperature {
            out.push_str(&format!("  Temperature: {}\n", t));
        }
        if let Some(p) = config.inference.top_p {
            out.push_str(&format!("  Top-p: {}\n", p));
        }
        if let Some(k) = config.inference.top_k {
            out.push_str(&format!("  Top-k: {}\n", k));
        }
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn make_config_file() -> RlmConfigFile {
        let yaml = r#"
profiles:
  base:
    provider:
      type: anthropic
      model: claude-sonnet-4-20250514
    budget:
      max_cost: 5.0
      max_iterations: 50
      max_time_seconds: 300
      max_depth: 3
      max_batch_concurrency: 5
    mode: auto
  research:
    extends: base
    provider:
      type: anthropic
      model: claude-opus-4-20250514
    budget:
      max_cost: 10.0
      max_iterations: 100
      max_time_seconds: 600
      max_depth: 3
      max_batch_concurrency: 5
  fast:
    extends: base
    inference:
      temperature: 0.0
      seed: 42
  claude-code:
    provider:
      type: claude-code
      model: claude-opus-4-6
    budget:
      max_cost: 5.0
      max_iterations: 30
      max_time_seconds: 300
      max_depth: 3
      max_batch_concurrency: 5
"#;
        serde_yaml::from_str(yaml).unwrap()
    }

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
        let profile = Profile::default();
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
}
