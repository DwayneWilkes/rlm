//! CLI helper functions extracted from main.rs for testability.
//!
//! These are the pure-logic portions of the CLI commands — config resolution,
//! mode parsing, output formatting — with no I/O side effects.

use std::path::Path;

use anyhow::Result;

use crate::config::{build_config, load_config_file, resolve_profile, CliOverrides};
use crate::types::{Mode, OutputFormat, ProviderConfig, RlmConfig, RlmResult};

/// Parse a CLI mode string ("direct", "iterative", or anything else → Auto) into a `Mode`.
pub fn parse_mode_str(s: &str) -> Mode {
    match s {
        "direct" => Mode::Direct,
        "iterative" => Mode::Iterative,
        _ => Mode::Auto,
    }
}

/// Parse a CLI output format string ("json", "yaml", or anything else → Text) into `OutputFormat`.
pub fn parse_output_format(s: &str) -> OutputFormat {
    match s {
        "json" => OutputFormat::Json,
        "yaml" => OutputFormat::Yaml,
        _ => OutputFormat::Text,
    }
}

/// Format an `RlmResult` into a display string according to the given `OutputFormat`.
pub fn format_result(result: &RlmResult, format: OutputFormat) -> Result<String> {
    match format {
        OutputFormat::Text => {
            let mut out = result.answer.clone();
            if let Some(ref synth) = result.synthesis {
                out.push_str("\n--- Synthesis ---\n");
                out.push_str(synth);
            }
            Ok(out)
        }
        OutputFormat::Json => Ok(serde_json::to_string_pretty(result)?),
        OutputFormat::Yaml => Ok(serde_yaml::to_string(result)?),
    }
}

/// Check whether the resolved mode needs to be downgraded for a claude-code provider.
///
/// Returns `(effective_mode, was_downgraded)`. When `mode` is `Iterative` and the
/// provider is `ClaudeCode`, the mode is forced to `Direct` because the subprocess
/// has its own identity protections that reject the REPL protocol.
pub fn resolve_effective_mode(mode: Mode, provider: &ProviderConfig) -> (Mode, bool) {
    if mode == Mode::Iterative && matches!(provider, ProviderConfig::ClaudeCode { .. }) {
        (Mode::Direct, true)
    } else {
        (mode, false)
    }
}

/// Build CLI overrides from mode/template/synthesize arguments.
pub fn build_cli_overrides(
    mode_str: Option<&str>,
    template_name: Option<&str>,
    synthesize: bool,
) -> CliOverrides {
    CliOverrides {
        provider: None,
        mode: mode_str.map(|m| parse_mode_str(m)),
        template: template_name.map(String::from),
        synthesize: if synthesize { Some(true) } else { None },
    }
}

/// Build an `RlmConfig` from a loaded config file (or None for defaults),
/// profile name, and CLI overrides. This is the pure-logic core shared by
/// `load_resolved_config` and tests.
pub fn resolve_config(
    loaded: Option<&crate::types::RlmConfigFile>,
    profile_name: Option<&str>,
    overrides: &CliOverrides,
) -> Result<RlmConfig> {
    match loaded {
        Some(cfg_file) => {
            let profile_key = profile_name
                .map(String::from)
                .or_else(|| {
                    // Use first profile if only one exists
                    if cfg_file.profiles.len() == 1 {
                        cfg_file.profiles.keys().next().cloned()
                    } else {
                        None
                    }
                })
                .unwrap_or_else(|| "default".to_string());

            let profile = resolve_profile(cfg_file, &profile_key)?;
            build_config(&profile, overrides)
        }
        None => {
            // No config file — use defaults
            let profile = crate::types::Profile {
                provider: Some(ProviderConfig::Anthropic {
                    model: "claude-sonnet-4-20250514".to_string(),
                    api_key_env: Some("ANTHROPIC_API_KEY".to_string()),
                }),
                ..crate::types::Profile::default()
            };
            build_config(&profile, overrides)
        }
    }
}

/// Load and resolve a full `RlmConfig` from an optional config file path, profile name,
/// and CLI arguments. Combines file loading with config resolution.
pub fn load_resolved_config(
    config_path: Option<&Path>,
    profile_name: Option<&str>,
    mode_str: Option<&str>,
    template_name: Option<&str>,
    synthesize: bool,
) -> Result<RlmConfig> {
    let overrides = build_cli_overrides(mode_str, template_name, synthesize);

    let loaded = load_config_file(config_path, None)?;
    let cfg_ref = loaded.as_ref().map(|(cfg, _path)| cfg);

    resolve_config(cfg_ref, profile_name, &overrides)
}
