use crate::engine::direct::DirectExecutor;
use crate::types::{Executor, Mode};

use super::fixtures::{direct_test_config, DirectMockLlm};

#[test]
fn direct_execution_returns_llm_response() {
    let mock = DirectMockLlm::new("The answer is 42.");
    let executor = DirectExecutor::new(&mock);
    let config = direct_test_config();

    let result = executor.execute("What is the answer?", "Some context", &config).unwrap();
    assert_eq!(result.answer, "The answer is 42.");
    assert_eq!(result.trace.mode, Some(Mode::Direct));
    assert!(result.trace.iterations.is_empty());
}

#[test]
fn direct_execution_includes_context_in_prompt() {
    let mock = DirectMockLlm::new("response");
    let executor = DirectExecutor::new(&mock);
    let config = direct_test_config();

    executor.execute("Summarize", "Hello world", &config).unwrap();

    let reqs = mock.captured_requests.lock().unwrap();
    assert_eq!(reqs.len(), 1);
    assert!(reqs[0].messages[0].content.contains("Summarize"));
    assert!(reqs[0].messages[0].content.contains("Hello world"));
}

#[test]
fn direct_execution_empty_context() {
    let mock = DirectMockLlm::new("response");
    let executor = DirectExecutor::new(&mock);
    let config = direct_test_config();

    executor.execute("Just a task", "", &config).unwrap();

    let reqs = mock.captured_requests.lock().unwrap();
    assert_eq!(reqs[0].messages[0].content, "Just a task");
}

#[test]
fn direct_execution_tracks_usage() {
    let mock = DirectMockLlm::new("response");
    let executor = DirectExecutor::new(&mock);
    let config = direct_test_config();

    let result = executor.execute("task", "ctx", &config).unwrap();
    assert_eq!(result.trace.usage.input_tokens, 100);
    assert_eq!(result.trace.usage.output_tokens, 50);
}

#[test]
fn direct_execution_has_system_prompt() {
    let mock = DirectMockLlm::new("response");
    let executor = DirectExecutor::new(&mock);
    let config = direct_test_config();

    executor.execute("task", "ctx", &config).unwrap();

    let reqs = mock.captured_requests.lock().unwrap();
    assert!(reqs[0].system.is_some());
}
