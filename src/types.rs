use std::collections::HashMap;

use anyhow::Result;
use serde::{Deserialize, Serialize};

// ── Execution Mode ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Direct,
    Iterative,
    #[default]
    Auto,
}

// ── Output Format ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OutputFormat {
    #[default]
    Text,
    Json,
    Yaml,
}

// ── Inference Options ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct InferenceOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_k: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seed: Option<u64>,
}

// ── LLM Types ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmRequest {
    pub model: String,
    pub messages: Vec<Message>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system: Option<String>,
    #[serde(default)]
    pub inference: InferenceOptions,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmResponse {
    pub content: String,
    pub usage: Usage,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Usage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cost_usd: Option<f64>,
}

// ── Budget ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Budget {
    /// Max cost in USD. None = no limit.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_cost: Option<f64>,
    /// Max total tokens (input + output). None = no limit.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u64>,
    /// Max wall-clock time in seconds.
    #[serde(default = "default_max_time")]
    pub max_time_seconds: u64,
    /// Max REPL iterations.
    #[serde(default = "default_max_iterations")]
    pub max_iterations: u32,
    /// Max recursion depth for rlm_query sub-calls.
    #[serde(default = "default_max_depth")]
    pub max_depth: u32,
    /// Max parallel sub-calls per batch.
    #[serde(default = "default_max_batch_concurrency")]
    pub max_batch_concurrency: u32,
}

fn default_max_time() -> u64 {
    300
}
fn default_max_iterations() -> u32 {
    50
}
fn default_max_depth() -> u32 {
    3
}
fn default_max_batch_concurrency() -> u32 {
    5
}

impl Default for Budget {
    fn default() -> Self {
        Self {
            max_cost: None,
            max_tokens: None,
            max_time_seconds: default_max_time(),
            max_iterations: default_max_iterations(),
            max_depth: default_max_depth(),
            max_batch_concurrency: default_max_batch_concurrency(),
        }
    }
}

// ── Budget Exhaustion ───────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BudgetExhaustedReason {
    CostExceeded,
    TokensExceeded,
    TimeExceeded,
    IterationsExceeded,
    DepthExceeded,
}

// ── Execution Trace ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ExecutionTrace {
    pub mode: Option<Mode>,
    pub iterations: Vec<Iteration>,
    pub usage: Usage,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub budget_exhausted: Option<BudgetExhaustedReason>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Iteration {
    pub index: u32,
    pub llm_response: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub code_executions: Vec<CodeExecution>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub sub_calls: Vec<SubCall>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeExecution {
    pub code: String,
    pub stdout: String,
    pub stderr: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubCall {
    pub call_type: SubCallType,
    pub prompt: String,
    pub response: String,
    pub usage: Usage,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SubCallType {
    LlmQuery,
    RlmQuery,
}

// ── RLM Result ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RlmResult {
    pub answer: String,
    pub trace: ExecutionTrace,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub synthesis: Option<String>,
}

// ── Parser Types ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub struct ParsedResponse {
    pub reasoning: String,
    pub code_blocks: Vec<String>,
    pub final_answer: Option<FinalAnswer>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum FinalAnswer {
    Literal(String),
    VarName(String),
}

// ── Sandbox Commands ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "cmd")]
pub enum SandboxCommand {
    #[serde(rename = "init")]
    Init { context: String },
    #[serde(rename = "exec")]
    Exec { code: String },
    #[serde(rename = "get_var")]
    GetVar { name: String },
    #[serde(rename = "shutdown")]
    Shutdown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxResponse {
    pub ok: bool,
    #[serde(default)]
    pub stdout: String,
    #[serde(default)]
    pub stderr: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// Sub-call requests from the sandbox (llm_query/rlm_query)
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub sub_calls: Vec<SubCallRequest>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubCallRequest {
    pub call_type: SubCallType,
    pub prompt: String,
    pub call_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubCallResponse {
    pub call_id: String,
    pub result: String,
}

// ── Provider Config ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ProviderConfig {
    Anthropic {
        model: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        api_key_env: Option<String>,
    },
    #[serde(rename = "openai")]
    OpenAi {
        model: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        base_url: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        api_key_env: Option<String>,
    },
    #[serde(rename = "claude-code")]
    ClaudeCode {
        #[serde(default = "default_claude_code_model")]
        model: String,
    },
}

fn default_claude_code_model() -> String {
    "claude-sonnet-4-20250514".to_string()
}

impl ProviderConfig {
    pub fn model(&self) -> &str {
        match self {
            Self::Anthropic { model, .. } => model,
            Self::OpenAi { model, .. } => model,
            Self::ClaudeCode { model } => model,
        }
    }
}

// ── Profile ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Profile {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extends: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<ProviderConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subcall_provider: Option<ProviderConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inference: Option<InferenceOptions>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub budget: Option<Budget>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mode: Option<Mode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub template: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub synthesize: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_hints: Option<HashMap<String, String>>,
}

// ── Config File ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RlmConfigFile {
    #[serde(default)]
    pub profiles: HashMap<String, Profile>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub templates_dir: Option<String>,
}

// ── Resolved Config ─────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct RlmConfig {
    pub provider: ProviderConfig,
    pub subcall_provider: Option<ProviderConfig>,
    pub inference: InferenceOptions,
    pub budget: Budget,
    pub mode: Mode,
    pub template: Option<String>,
    pub synthesize: bool,
    pub model_hints: HashMap<String, String>,
    pub templates_dir: Option<String>,
}

// ── Template ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptTemplate {
    pub name: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mode: Option<Mode>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "systemPrompt")]
    pub system_prompt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inference: Option<InferenceOptions>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub synthesize: Option<bool>,
}

// ── Model Context Limits ────────────────────────────────────────────────────

/// Known context window sizes for common models (in tokens).
pub fn model_context_limit(model: &str) -> u64 {
    match model {
        m if m.contains("claude-opus") => 200_000,
        m if m.contains("claude-sonnet") => 200_000,
        m if m.contains("claude-haiku") => 200_000,
        m if m.contains("gpt-4o") => 128_000,
        m if m.contains("gpt-4") => 128_000,
        m if m.contains("gpt-3.5") => 16_385,
        m if m.contains("llama3") => 8_192,
        m if m.contains("mistral") => 32_768,
        m if m.contains("gemini") => 1_000_000,
        _ => 128_000, // conservative default
    }
}

/// Rough token estimate: chars / 4.
pub fn estimate_tokens(text: &str) -> u64 {
    (text.len() as u64) / 4
}

// ── Traits ──────────────────────────────────────────────────────────────────

/// LLM client trait — implemented by each provider adapter.
pub trait LlmClient: Send + Sync {
    fn complete(&self, request: &LlmRequest) -> Result<LlmResponse>;
}

/// Sandbox trait — implemented by the Python subprocess sandbox.
pub trait Sandbox {
    fn init(&mut self, context: &str) -> Result<()>;
    fn execute(&mut self, code: &str) -> Result<SandboxResponse>;
    fn get_var(&mut self, name: &str) -> Result<Option<String>>;
    fn destroy(&mut self) -> Result<()>;
}

/// Executor trait — implemented by DirectExecutor and IterativeExecutor.
pub trait Executor {
    fn execute(&self, task: &str, context: &str, config: &RlmConfig) -> Result<RlmResult>;
}

// ── Budget Snapshot (for reporting) ─────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BudgetSnapshot {
    pub cost_usd: f64,
    pub total_tokens: u64,
    pub elapsed_seconds: f64,
    pub iterations: u32,
    pub depth: u32,
    pub limits: Budget,
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
