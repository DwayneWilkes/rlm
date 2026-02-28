use std::collections::HashMap;

use anyhow::Result;
use serde_json::Value;

use crate::engine::direct::DirectExecutor;
use crate::engine::iterative::IterativeExecutor;
use crate::engine::mode::resolve_mode;
use crate::llm::anthropic::AnthropicClient;
use crate::llm::claude_code::ClaudeCodeClient;
use crate::llm::openai::OpenAiClient;
use crate::prompt::templates::load_template;
use crate::protocol::ToolResult;
use crate::sandbox::python::PythonSandbox;
use crate::tools::ToolHandler;
use crate::types::{Executor, LlmClient, Mode, ProviderConfig, RlmConfig};

pub struct RlmExecute;

impl ToolHandler for RlmExecute {
    fn name(&self) -> &'static str {
        "rlm_execute"
    }

    fn description(&self) -> &'static str {
        "Execute a task with the RLM engine. Supports iterative (LLM + Python REPL loop) and direct (single LLM call) modes."
    }

    fn input_schema(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "task": {
                    "type": "string",
                    "description": "The task to execute"
                },
                "context": {
                    "type": "string",
                    "description": "Input data/context for the task"
                },
                "mode": {
                    "type": "string",
                    "enum": ["direct", "iterative", "auto"],
                    "description": "Execution mode (default: auto)"
                },
                "template": {
                    "type": "string",
                    "description": "Name of a prompt template to use"
                },
                "synthesize": {
                    "type": "boolean",
                    "description": "Run synthesis pass after iterative extraction"
                },
                "max_cost": {
                    "type": "number",
                    "description": "Maximum cost in USD"
                },
                "max_iterations": {
                    "type": "integer",
                    "description": "Maximum REPL iterations"
                },
                "max_time_seconds": {
                    "type": "integer",
                    "description": "Maximum wall-clock time in seconds"
                },
                "provider": {
                    "type": "string",
                    "enum": ["anthropic", "openai", "claude-code"],
                    "description": "LLM provider"
                },
                "model": {
                    "type": "string",
                    "description": "Model name"
                }
            },
            "required": ["task"],
            "additionalProperties": false
        })
    }

    fn call(&self, args: Value) -> Result<ToolResult> {
        let task = args["task"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing 'task' parameter"))?;
        let context = args["context"].as_str().unwrap_or("");

        // Build config from args
        let config = config_from_args(&args)?;

        // Resolve mode
        let mut mode = resolve_mode(config.mode, context, config.provider.model());

        // claude-code provider only supports direct mode — the subprocess has
        // its own identity and safety protections that reject the REPL protocol
        // (system prompt override is detected as prompt injection).
        let downgraded = if mode == Mode::Iterative
            && matches!(config.provider, ProviderConfig::ClaudeCode { .. })
        {
            mode = Mode::Direct;
            true
        } else {
            false
        };

        // Validate template exists if specified
        if let Some(name) = &config.template {
            load_template(name, None)?;
        }

        // Build LLM client
        let client = build_client(&config.provider)?;

        // Execute
        let mut result = match mode {
            Mode::Direct => {
                let executor = DirectExecutor::new(client.as_ref());
                executor.execute(task, context, &config)?
            }
            Mode::Iterative | Mode::Auto => {
                let sandbox = PythonSandbox::new()?;
                let mut executor = IterativeExecutor::new(client.as_ref(), Box::new(sandbox));
                executor.execute_mut(task, context, &config)?
            }
        };

        if downgraded {
            result.answer = format!(
                "[Note: claude-code provider does not support iterative mode — \
                 used direct mode instead. Use anthropic or openai provider for iterative.]\n\n{}",
                result.answer
            );
        }

        Ok(ToolResult::ok(serde_json::to_string_pretty(&result)?))
    }
}

// pub(crate) for test access from src/tests/
pub(crate) fn config_from_args(args: &Value) -> Result<RlmConfig> {
    // Parse provider from args or default to anthropic
    let provider_type = args["provider"].as_str().unwrap_or("anthropic");
    let model = args["model"].as_str().unwrap_or(match provider_type {
        "anthropic" => "claude-sonnet-4-20250514",
        "openai" => "gpt-4o",
        "claude-code" => "claude-sonnet-4-20250514",
        _ => "claude-sonnet-4-20250514",
    });

    let provider = match provider_type {
        "anthropic" => ProviderConfig::Anthropic {
            model: model.to_string(),
            api_key_env: Some("ANTHROPIC_API_KEY".to_string()),
        },
        "openai" => ProviderConfig::OpenAi {
            model: model.to_string(),
            base_url: None,
            api_key_env: Some("OPENAI_API_KEY".to_string()),
        },
        "claude-code" => ProviderConfig::ClaudeCode {
            model: model.to_string(),
        },
        other => anyhow::bail!("Unknown provider: {}", other),
    };

    let mode_str = args["mode"].as_str().unwrap_or("auto");
    let mode = match mode_str {
        "direct" => Mode::Direct,
        "iterative" => Mode::Iterative,
        _ => Mode::Auto,
    };

    let mut budget = crate::types::Budget::default();
    if let Some(v) = args["max_cost"].as_f64() {
        budget.max_cost = Some(v);
    }
    if let Some(v) = args["max_iterations"].as_u64() {
        budget.max_iterations = v as u32;
    }
    if let Some(v) = args["max_time_seconds"].as_u64() {
        budget.max_time_seconds = v;
    }

    Ok(RlmConfig {
        provider,
        subcall_provider: None,
        inference: crate::types::InferenceOptions::default(),
        budget,
        mode,
        template: args["template"].as_str().map(String::from),
        synthesize: args["synthesize"].as_bool().unwrap_or(false),
        model_hints: HashMap::new(),
        templates_dir: None,
    })
}

/// Build an LLM client from a resolved RlmConfig.
pub fn build_client_from_config(config: &RlmConfig) -> Result<Box<dyn LlmClient>> {
    build_client(&config.provider)
}

// pub(crate) for test access from src/tests/
pub(crate) fn build_client(provider: &ProviderConfig) -> Result<Box<dyn LlmClient>> {
    match provider {
        ProviderConfig::Anthropic { api_key_env, .. } => {
            let env_var = api_key_env.as_deref().unwrap_or("ANTHROPIC_API_KEY");
            let api_key = std::env::var(env_var)
                .map_err(|_| anyhow::anyhow!("Missing env var: {}", env_var))?;
            Ok(Box::new(AnthropicClient::new(api_key)))
        }
        ProviderConfig::OpenAi {
            base_url,
            api_key_env,
            ..
        } => {
            let api_key = api_key_env
                .as_deref()
                .and_then(|env| std::env::var(env).ok());
            Ok(Box::new(OpenAiClient::new(base_url.clone(), api_key)))
        }
        ProviderConfig::ClaudeCode { model } => {
            Ok(Box::new(ClaudeCodeClient::new(model.clone())))
        }
    }
}
