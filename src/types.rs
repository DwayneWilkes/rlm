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
