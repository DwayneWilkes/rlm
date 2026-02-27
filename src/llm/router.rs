use anyhow::Result;

use crate::types::{LlmClient, LlmRequest, LlmResponse, SubCallType};

/// Routes LLM requests to the appropriate provider.
/// Supports a primary client for the main execution loop
/// and an optional separate client for sub-calls.
pub struct LlmRouter {
    primary: Box<dyn LlmClient>,
    subcall: Option<Box<dyn LlmClient>>,
}

impl LlmRouter {
    pub fn new(primary: Box<dyn LlmClient>) -> Self {
        Self {
            primary,
            subcall: None,
        }
    }

    pub fn with_subcall(mut self, client: Box<dyn LlmClient>) -> Self {
        self.subcall = Some(client);
        self
    }

    /// Route a request based on call type.
    /// Main loop calls use the primary client.
    /// Sub-calls (llm_query/rlm_query) use the subcall client if configured,
    /// otherwise fall back to primary.
    pub fn complete(
        &self,
        request: &LlmRequest,
        call_type: Option<&SubCallType>,
    ) -> Result<LlmResponse> {
        let client = match (call_type, &self.subcall) {
            (Some(_), Some(subcall)) => subcall.as_ref(),
            _ => self.primary.as_ref(),
        };
        client.complete(request)
    }
}
