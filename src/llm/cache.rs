use std::collections::HashMap;

use sha2::{Digest, Sha256};

use crate::types::{LlmRequest, LlmResponse};

/// In-memory response cache keyed by content hash of the request.
/// Scoped to a single execution — not persisted.
#[derive(Default)]
pub struct ResponseCache {
    entries: HashMap<String, LlmResponse>,
}

impl ResponseCache {
    pub fn new() -> Self {
        Self::default()
    }

    /// Look up a cached response for the given request.
    pub fn get(&self, request: &LlmRequest) -> Option<&LlmResponse> {
        let key = Self::cache_key(request);
        self.entries.get(&key)
    }

    /// Store a response in the cache.
    pub fn put(&mut self, request: &LlmRequest, response: LlmResponse) {
        let key = Self::cache_key(request);
        self.entries.insert(key, response);
    }

    /// Number of cached entries.
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// Whether the cache is empty.
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Compute a stable cache key from the request by hashing the JSON-serialized
    /// (model, messages, system, inference) tuple.
    fn cache_key(request: &LlmRequest) -> String {
        let mut hasher = Sha256::new();
        // Hash the canonical JSON representation
        if let Ok(json) = serde_json::to_string(request) {
            hasher.update(json.as_bytes());
        }
        format!("{:x}", hasher.finalize())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{InferenceOptions, LlmRequest, LlmResponse, Message, Usage};

    fn make_request(prompt: &str) -> LlmRequest {
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

    fn make_response(text: &str) -> LlmResponse {
        LlmResponse {
            content: text.into(),
            usage: Usage {
                input_tokens: 10,
                output_tokens: 5,
                cost_usd: None,
            },
        }
    }

    #[test]
    fn cache_miss_returns_none() {
        let cache = ResponseCache::new();
        let req = make_request("hello");
        assert!(cache.get(&req).is_none());
    }

    #[test]
    fn cache_hit_returns_stored_response() {
        let mut cache = ResponseCache::new();
        let req = make_request("hello");
        let resp = make_response("world");
        cache.put(&req, resp.clone());

        let cached = cache.get(&req).unwrap();
        assert_eq!(cached.content, "world");
    }

    #[test]
    fn different_requests_have_different_keys() {
        let mut cache = ResponseCache::new();
        let req1 = make_request("hello");
        let req2 = make_request("goodbye");
        cache.put(&req1, make_response("r1"));
        cache.put(&req2, make_response("r2"));

        assert_eq!(cache.get(&req1).unwrap().content, "r1");
        assert_eq!(cache.get(&req2).unwrap().content, "r2");
        assert_eq!(cache.len(), 2);
    }

    #[test]
    fn same_request_overwrites() {
        let mut cache = ResponseCache::new();
        let req = make_request("hello");
        cache.put(&req, make_response("first"));
        cache.put(&req, make_response("second"));

        assert_eq!(cache.get(&req).unwrap().content, "second");
        assert_eq!(cache.len(), 1);
    }

    #[test]
    fn key_stability() {
        // Same request should produce the same key every time
        let req = make_request("stable");
        let key1 = ResponseCache::cache_key(&req);
        let key2 = ResponseCache::cache_key(&req);
        assert_eq!(key1, key2);
    }

    #[test]
    fn model_affects_key() {
        let mut req1 = make_request("hello");
        req1.model = "model-a".into();
        let mut req2 = make_request("hello");
        req2.model = "model-b".into();

        let key1 = ResponseCache::cache_key(&req1);
        let key2 = ResponseCache::cache_key(&req2);
        assert_ne!(key1, key2);
    }
}
