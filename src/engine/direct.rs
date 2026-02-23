use anyhow::Result;

use crate::types::{
    ExecutionTrace, Executor, LlmClient, LlmRequest, Message, Mode, RlmConfig, RlmResult,
};

/// Executes a task in direct mode: single LLM call with full context in the prompt.
/// No REPL sandbox involved.
pub struct DirectExecutor<'a> {
    client: &'a dyn LlmClient,
}

impl<'a> DirectExecutor<'a> {
    pub fn new(client: &'a dyn LlmClient) -> Self {
        Self { client }
    }
}

impl<'a> Executor for DirectExecutor<'a> {
    fn execute(&self, task: &str, context: &str, config: &RlmConfig) -> Result<RlmResult> {
        let system = config
            .template
            .as_ref()
            .and(None::<String>) // template system prompt would be resolved externally
            .or_else(|| Some(default_direct_system_prompt().to_string()));

        let user_content = if context.is_empty() {
            task.to_string()
        } else {
            format!("{}\n\n---\n\n{}", task, context)
        };

        let request = LlmRequest {
            model: config.provider.model().to_string(),
            messages: vec![Message {
                role: "user".into(),
                content: user_content,
            }],
            system,
            inference: config.inference.clone(),
        };

        let response = self.client.complete(&request)?;

        Ok(RlmResult {
            answer: response.content.clone(),
            trace: ExecutionTrace {
                mode: Some(Mode::Direct),
                iterations: vec![],
                usage: response.usage,
                budget_exhausted: None,
            },
            synthesis: None,
        })
    }
}

fn default_direct_system_prompt() -> &'static str {
    "You are a helpful assistant. Analyze the provided context and answer the user's question directly and thoroughly."
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{Budget, InferenceOptions, LlmResponse, ProviderConfig, Usage};
    use std::collections::HashMap;
    use std::sync::Mutex;

    struct MockLlm {
        response: String,
        captured_requests: Mutex<Vec<LlmRequest>>,
    }

    impl MockLlm {
        fn new(response: &str) -> Self {
            Self {
                response: response.to_string(),
                captured_requests: Mutex::new(vec![]),
            }
        }
    }

    impl LlmClient for MockLlm {
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

    fn test_config() -> RlmConfig {
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

    #[test]
    fn direct_execution_returns_llm_response() {
        let mock = MockLlm::new("The answer is 42.");
        let executor = DirectExecutor::new(&mock);
        let config = test_config();

        let result = executor.execute("What is the answer?", "Some context", &config).unwrap();
        assert_eq!(result.answer, "The answer is 42.");
        assert_eq!(result.trace.mode, Some(Mode::Direct));
        assert!(result.trace.iterations.is_empty());
    }

    #[test]
    fn direct_execution_includes_context_in_prompt() {
        let mock = MockLlm::new("response");
        let executor = DirectExecutor::new(&mock);
        let config = test_config();

        executor.execute("Summarize", "Hello world", &config).unwrap();

        let reqs = mock.captured_requests.lock().unwrap();
        assert_eq!(reqs.len(), 1);
        assert!(reqs[0].messages[0].content.contains("Summarize"));
        assert!(reqs[0].messages[0].content.contains("Hello world"));
    }

    #[test]
    fn direct_execution_empty_context() {
        let mock = MockLlm::new("response");
        let executor = DirectExecutor::new(&mock);
        let config = test_config();

        executor.execute("Just a task", "", &config).unwrap();

        let reqs = mock.captured_requests.lock().unwrap();
        assert_eq!(reqs[0].messages[0].content, "Just a task");
    }

    #[test]
    fn direct_execution_tracks_usage() {
        let mock = MockLlm::new("response");
        let executor = DirectExecutor::new(&mock);
        let config = test_config();

        let result = executor.execute("task", "ctx", &config).unwrap();
        assert_eq!(result.trace.usage.input_tokens, 100);
        assert_eq!(result.trace.usage.output_tokens, 50);
    }

    #[test]
    fn direct_execution_has_system_prompt() {
        let mock = MockLlm::new("response");
        let executor = DirectExecutor::new(&mock);
        let config = test_config();

        executor.execute("task", "ctx", &config).unwrap();

        let reqs = mock.captured_requests.lock().unwrap();
        assert!(reqs[0].system.is_some());
    }
}
