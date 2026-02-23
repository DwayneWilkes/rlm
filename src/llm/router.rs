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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{InferenceOptions, LlmResponse, Message, Usage};
    use std::sync::atomic::{AtomicU32, Ordering};

    struct MockClient {
        name: &'static str,
        call_count: AtomicU32,
    }

    impl MockClient {
        fn new(name: &'static str) -> Self {
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

    fn make_request() -> LlmRequest {
        LlmRequest {
            model: "test".into(),
            messages: vec![Message {
                role: "user".into(),
                content: "test".into(),
            }],
            system: None,
            inference: InferenceOptions::default(),
        }
    }

    #[test]
    fn primary_used_for_main_calls() {
        let router = LlmRouter::new(Box::new(MockClient::new("primary")));
        let req = make_request();
        let resp = router.complete(&req, None).unwrap();
        assert_eq!(resp.content, "response from primary");
    }

    #[test]
    fn primary_used_for_subcalls_when_no_subcall_client() {
        let router = LlmRouter::new(Box::new(MockClient::new("primary")));
        let req = make_request();
        let resp = router.complete(&req, Some(&SubCallType::LlmQuery)).unwrap();
        assert_eq!(resp.content, "response from primary");
    }

    #[test]
    fn subcall_client_used_for_subcalls() {
        let router = LlmRouter::new(Box::new(MockClient::new("primary")))
            .with_subcall(Box::new(MockClient::new("subcall")));
        let req = make_request();

        // Main call → primary
        let resp = router.complete(&req, None).unwrap();
        assert_eq!(resp.content, "response from primary");

        // Sub-call → subcall
        let resp = router.complete(&req, Some(&SubCallType::LlmQuery)).unwrap();
        assert_eq!(resp.content, "response from subcall");

        // rlm_query sub-call → subcall
        let resp = router.complete(&req, Some(&SubCallType::RlmQuery)).unwrap();
        assert_eq!(resp.content, "response from subcall");
    }
}
