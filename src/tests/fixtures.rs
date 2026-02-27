use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;

use anyhow::Result;

use crate::server::Server;
use crate::tools::all_tools;
use crate::types::{
    Budget, InferenceOptions, LlmClient, LlmRequest, LlmResponse, Message, Mode, ProviderConfig,
    RlmConfig, RlmConfigFile, Sandbox, SandboxResponse, Usage,
};

// ── MockLlm (engine/iterative) ─────────────────────────────────────────────

pub struct MockLlm {
    pub responses: Vec<String>,
    pub call_idx: AtomicU32,
}

impl MockLlm {
    pub fn new(responses: Vec<&str>) -> Self {
        Self {
            responses: responses.into_iter().map(String::from).collect(),
            call_idx: AtomicU32::new(0),
        }
    }
}

impl LlmClient for MockLlm {
    fn complete(&self, _request: &LlmRequest) -> Result<LlmResponse> {
        let idx = self
            .call_idx
            .fetch_add(1, Ordering::SeqCst) as usize;
        let content = self
            .responses
            .get(idx)
            .cloned()
            .unwrap_or_else(|| "FINAL(fallback)".to_string());
        Ok(LlmResponse {
            content,
            usage: Usage {
                input_tokens: 100,
                output_tokens: 50,
                cost_usd: None,
            },
        })
    }
}

// ── CapturingMockLlm (engine/iterative) ─────────────────────────────────────

pub struct CapturingMockLlm {
    pub responses: Vec<String>,
    pub call_idx: AtomicU32,
    pub captured: Mutex<Vec<LlmRequest>>,
}

impl CapturingMockLlm {
    pub fn new(responses: Vec<&str>) -> Self {
        Self {
            responses: responses.into_iter().map(String::from).collect(),
            call_idx: AtomicU32::new(0),
            captured: Mutex::new(Vec::new()),
        }
    }

    pub fn requests(&self) -> Vec<LlmRequest> {
        self.captured.lock().unwrap().clone()
    }
}

impl LlmClient for CapturingMockLlm {
    fn complete(&self, request: &LlmRequest) -> Result<LlmResponse> {
        self.captured.lock().unwrap().push(request.clone());
        let idx = self
            .call_idx
            .fetch_add(1, Ordering::SeqCst) as usize;
        let content = self
            .responses
            .get(idx)
            .cloned()
            .unwrap_or_else(|| "FINAL(fallback)".to_string());
        Ok(LlmResponse {
            content,
            usage: Usage {
                input_tokens: 100,
                output_tokens: 50,
                cost_usd: None,
            },
        })
    }
}

// ── MockSandbox (engine/iterative) ──────────────────────────────────────────

pub struct MockSandbox {
    pub vars: HashMap<String, String>,
}

impl MockSandbox {
    pub fn new() -> Self {
        Self {
            vars: HashMap::new(),
        }
    }
}

impl Sandbox for MockSandbox {
    fn init(&mut self, context: &str) -> Result<()> {
        self.vars.insert("context".into(), context.into());
        Ok(())
    }

    fn execute(&mut self, code: &str) -> Result<SandboxResponse> {
        // Simulate basic execution
        let stdout = if code.contains("print") {
            "mock output\n".to_string()
        } else if code.contains("result =") {
            self.vars.insert("result".into(), "computed_value".into());
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

// ── DirectMockLlm (engine/direct) ───────────────────────────────────────────

pub struct DirectMockLlm {
    pub response: String,
    pub captured_requests: Mutex<Vec<LlmRequest>>,
}

impl DirectMockLlm {
    pub fn new(response: &str) -> Self {
        Self {
            response: response.to_string(),
            captured_requests: Mutex::new(vec![]),
        }
    }
}

impl LlmClient for DirectMockLlm {
    fn complete(&self, request: &LlmRequest) -> Result<LlmResponse> {
        self.captured_requests.lock().unwrap().push(request.clone());
        Ok(LlmResponse {
            content: self.response.clone(),
            usage: Usage {
                input_tokens: 100,
                output_tokens: 50,
                cost_usd: Some(0.001),
            },
        })
    }
}

// ── MockClient (llm/router) ────────────────────────────────────────────────

pub struct MockClient {
    pub name: &'static str,
    pub call_count: AtomicU32,
}

impl MockClient {
    pub fn new(name: &'static str) -> Self {
        Self {
            name,
            call_count: AtomicU32::new(0),
        }
    }
}

impl LlmClient for MockClient {
    fn complete(&self, _request: &LlmRequest) -> Result<LlmResponse> {
        self.call_count.fetch_add(1, Ordering::SeqCst);
        Ok(LlmResponse {
            content: format!("response from {}", self.name),
            usage: Usage::default(),
        })
    }
}

// ── Shared helpers ──────────────────────────────────────────────────────────

pub fn test_config() -> RlmConfig {
    RlmConfig {
        provider: ProviderConfig::Anthropic {
            model: "test-model".into(),
            api_key_env: None,
        },
        subcall_provider: None,
        inference: InferenceOptions::default(),
        budget: Budget {
            max_iterations: 10,
            max_time_seconds: 300,
            ..Budget::default()
        },
        mode: Mode::Iterative,
        template: None,
        synthesize: false,
        model_hints: HashMap::new(),
        templates_dir: None,
    }
}

pub fn direct_test_config() -> RlmConfig {
    RlmConfig {
        provider: ProviderConfig::Anthropic {
            model: "test-model".into(),
            api_key_env: None,
        },
        subcall_provider: None,
        inference: InferenceOptions::default(),
        budget: Budget::default(),
        mode: Mode::Direct,
        template: None,
        synthesize: false,
        model_hints: HashMap::new(),
        templates_dir: None,
    }
}

pub fn budget_with_defaults() -> Budget {
    Budget::default()
}

pub fn make_sandbox() -> Result<crate::sandbox::python::PythonSandbox> {
    crate::sandbox::python::PythonSandbox::new()
}

pub fn make_request(prompt: &str) -> LlmRequest {
    LlmRequest {
        model: "test-model".into(),
        messages: vec![Message {
            role: "user".into(),
            content: prompt.into(),
        }],
        system: None,
        inference: InferenceOptions::default(),
    }
}

pub fn make_response(text: &str) -> LlmResponse {
    LlmResponse {
        content: text.into(),
        usage: Usage {
            input_tokens: 10,
            output_tokens: 5,
            cost_usd: None,
        },
    }
}

pub fn make_server() -> Server {
    Server::new(all_tools())
}

pub fn make_config_file() -> RlmConfigFile {
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
