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
