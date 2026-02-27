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
    // pub(crate) for test access from src/tests/
    pub(crate) fn cache_key(request: &LlmRequest) -> String {
        let mut hasher = Sha256::new();
        // Hash the canonical JSON representation
        if let Ok(json) = serde_json::to_string(request) {
            hasher.update(json.as_bytes());
        }
        format!("{:x}", hasher.finalize())
    }
}
