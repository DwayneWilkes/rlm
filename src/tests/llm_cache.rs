use crate::llm::cache::ResponseCache;

use super::fixtures::{make_request, make_response};

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
