use crate::llm::router::LlmRouter;
use crate::types::SubCallType;

use super::fixtures::{make_request, MockClient};

#[test]
fn primary_used_for_main_calls() {
    let router = LlmRouter::new(Box::new(MockClient::new("primary")));
    let req = make_request("test");
    let resp = router.complete(&req, None).unwrap();
    assert_eq!(resp.content, "response from primary");
}

#[test]
fn primary_used_for_subcalls_when_no_subcall_client() {
    let router = LlmRouter::new(Box::new(MockClient::new("primary")));
    let req = make_request("test");
    let resp = router.complete(&req, Some(&SubCallType::LlmQuery)).unwrap();
    assert_eq!(resp.content, "response from primary");
}

#[test]
fn subcall_client_used_for_subcalls() {
    let router = LlmRouter::new(Box::new(MockClient::new("primary")))
        .with_subcall(Box::new(MockClient::new("subcall")));
    let req = make_request("test");

    // Main call -> primary
    let resp = router.complete(&req, None).unwrap();
    assert_eq!(resp.content, "response from primary");

    // Sub-call -> subcall
    let resp = router.complete(&req, Some(&SubCallType::LlmQuery)).unwrap();
    assert_eq!(resp.content, "response from subcall");

    // rlm_query sub-call -> subcall
    let resp = router.complete(&req, Some(&SubCallType::RlmQuery)).unwrap();
    assert_eq!(resp.content, "response from subcall");
}
