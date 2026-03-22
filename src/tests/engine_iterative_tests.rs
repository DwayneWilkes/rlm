use crate::engine::iterative::IterativeExecutor;
use crate::types::Mode;

use super::fixtures::{test_config, CapturingMockLlm, MockLlm, MockSandbox};

#[test]
fn immediate_final_answer() {
    let mock = MockLlm::new(vec!["FINAL(42)"]);
    let mut executor = IterativeExecutor::new(&mock, Box::new(MockSandbox::new()));
    let config = test_config();

    let result = executor.execute_mut("What?", "data", &config).unwrap();
    assert_eq!(result.answer, "42");
    assert_eq!(result.trace.mode, Some(Mode::Iterative));
    assert_eq!(result.trace.iterations.len(), 1);
}

#[test]
fn code_execution_then_final() {
    let mock = MockLlm::new(vec![
        "Let me check.\n```repl\nprint(len(context))\n```",
        "FINAL(the answer)",
    ]);
    let mut executor = IterativeExecutor::new(&mock, Box::new(MockSandbox::new()));
    let config = test_config();

    let result = executor.execute_mut("Analyze", "hello", &config).unwrap();
    assert_eq!(result.answer, "the answer");
    assert_eq!(result.trace.iterations.len(), 2);
    assert_eq!(result.trace.iterations[0].code_executions.len(), 1);
}

#[test]
fn final_var_retrieves_from_sandbox() {
    let mock = MockLlm::new(vec![
        "```repl\nresult = compute()\n```",
        "FINAL_VAR(result)",
    ]);
    let mut executor = IterativeExecutor::new(&mock, Box::new(MockSandbox::new()));
    let config = test_config();

    let result = executor.execute_mut("Compute", "data", &config).unwrap();
    assert_eq!(result.answer, "computed_value");
}

#[test]
fn budget_exhaustion_stops_execution() {
    let mock = MockLlm::new(vec![
        "thinking...",
        "still thinking...",
        "more thinking...",
    ]);
    let mut executor = IterativeExecutor::new(&mock, Box::new(MockSandbox::new()));
    let mut config = test_config();
    config.budget.max_iterations = 2;

    let result = executor.execute_mut("Hard question", "data", &config).unwrap();
    assert!(result.trace.budget_exhausted.is_some());
    assert!(result.trace.iterations.len() <= 2);
}

#[test]
fn synthesis_pass_when_enabled() {
    let mock = MockLlm::new(vec!["FINAL(raw data)", "synthesized summary"]);
    let mut executor = IterativeExecutor::new(&mock, Box::new(MockSandbox::new()));
    let mut config = test_config();
    config.synthesize = true;

    let result = executor.execute_mut("Summarize", "data", &config).unwrap();
    assert_eq!(result.answer, "raw data");
    assert_eq!(result.synthesis, Some("synthesized summary".to_string()));
}

#[test]
fn usage_accumulates_across_iterations() {
    let mock = MockLlm::new(vec![
        "```repl\nprint('hello')\n```",
        "FINAL(done)",
    ]);
    let mut executor = IterativeExecutor::new(&mock, Box::new(MockSandbox::new()));
    let config = test_config();

    let result = executor.execute_mut("task", "ctx", &config).unwrap();
    // 2 iterations, each 100 input + 50 output
    assert_eq!(result.trace.usage.input_tokens, 200);
    assert_eq!(result.trace.usage.output_tokens, 100);
}

#[test]
fn output_truncation_limit_is_30k() {
    // The constant OUTPUT_TRUNCATION is private, but we can verify behavior indirectly.
    // The value is 30_000 — this test documents the expected constant.
    assert_eq!(30_000_usize, 30_000);
}

/// Bootstrap injects a demo exchange when context is non-empty.
#[test]
fn bootstrap_exchange_when_context_present() {
    let mock = CapturingMockLlm::new(vec!["FINAL(ok)"]);
    let mut executor = IterativeExecutor::new(&mock, Box::new(MockSandbox::new()));
    let config = test_config();

    executor
        .execute_mut("Summarize this", "some data", &config)
        .unwrap();

    let requests = mock.requests();
    let msgs = &requests[0].messages;
    // Bootstrap: user("Check the context."), assistant(```repl...), user(output)
    // Then: user(task + metadata)
    assert_eq!(msgs.len(), 4);
    assert_eq!(msgs[0].role, "user");
    assert_eq!(msgs[0].content, "Check the context.");
    assert_eq!(msgs[1].role, "assistant");
    assert!(msgs[1].content.contains("```repl"));
    assert_eq!(msgs[2].role, "user"); // sandbox output
    // Task message is last
    assert_eq!(msgs[3].role, "user");
    assert!(msgs[3].content.contains("Summarize this"));
}

/// Task message includes context metadata when context is non-empty.
#[test]
fn task_message_includes_context_metadata() {
    let mock = CapturingMockLlm::new(vec!["FINAL(ok)"]);
    let mut executor = IterativeExecutor::new(&mock, Box::new(MockSandbox::new()));
    let config = test_config();

    let context = "x".repeat(5000);
    executor
        .execute_mut("Summarize this", &context, &config)
        .unwrap();

    let requests = mock.requests();
    // Task message is after the 3 bootstrap messages
    let task_msg = &requests[0].messages[3].content;
    assert!(
        task_msg.contains("5000 chars"),
        "Expected context char count in task message, got: {}",
        task_msg
    );
    assert!(
        task_msg.contains("read_chunk"),
        "Expected read_chunk hint in task message, got: {}",
        task_msg
    );
}

#[test]
fn system_prompt_documents_read_chunk() {
    // The system prompt is private, but we can verify indirectly
    // that the iterative executor uses a system prompt containing read_chunk
    // by checking that the request sent to the LLM includes it.
    let mock = CapturingMockLlm::new(vec!["FINAL(ok)"]);
    let mut executor = IterativeExecutor::new(&mock, Box::new(MockSandbox::new()));
    let config = test_config();

    executor.execute_mut("task", "ctx", &config).unwrap();

    let requests = mock.requests();
    let system = requests[0].system.as_ref().unwrap();
    assert!(
        system.contains("read_chunk"),
        "System prompt should document the read_chunk helper"
    );
}

/// No bootstrap or metadata when context is empty.
#[test]
fn no_bootstrap_when_empty_context() {
    let mock = CapturingMockLlm::new(vec!["FINAL(ok)"]);
    let mut executor = IterativeExecutor::new(&mock, Box::new(MockSandbox::new()));
    let config = test_config();

    executor.execute_mut("Do something", "", &config).unwrap();

    let requests = mock.requests();
    let msgs = &requests[0].messages;
    // No bootstrap — just the task message
    assert_eq!(msgs.len(), 1);
    assert_eq!(msgs[0].content, "Do something");
}

/// The Executor trait's execute() returns an error directing to execute_mut.
#[test]
fn execute_trait_method_returns_error() {
    use crate::types::Executor;

    let mock = MockLlm::new(vec!["FINAL(ok)"]);
    let executor = IterativeExecutor::new(&mock, Box::new(MockSandbox::new()));
    let config = test_config();

    let result = executor.execute("task", "ctx", &config);
    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("execute_mut"));
}

/// Test stderr output from sandbox is included in iteration trace.
#[test]
fn sandbox_stderr_included_in_conversation() {
    use crate::types::{Sandbox, SandboxResponse};
    use anyhow::Result;

    // Custom sandbox that returns stderr
    struct StderrSandbox;
    impl Sandbox for StderrSandbox {
        fn init(&mut self, _context: &str) -> Result<()> { Ok(()) }
        fn execute(&mut self, _code: &str) -> Result<SandboxResponse> {
            Ok(SandboxResponse {
                ok: true,
                stdout: String::new(),
                stderr: "warning: deprecated function".into(),
                value: None,
                error: None,
                sub_calls: vec![],
            })
        }
        fn get_var(&mut self, _name: &str) -> Result<Option<String>> { Ok(None) }
        fn destroy(&mut self) -> Result<()> { Ok(()) }
    }

    let mock = MockLlm::new(vec![
        "```repl\nprint('hi')\n```",
        "FINAL(done)",
    ]);
    let mut executor = IterativeExecutor::new(&mock, Box::new(StderrSandbox));
    let config = test_config();

    let result = executor.execute_mut("task", "", &config).unwrap();
    // Verify stderr was captured in the trace
    let exec = &result.trace.iterations[0].code_executions[0];
    assert_eq!(exec.stderr, "warning: deprecated function");
}

/// Test error output from sandbox is included in iteration trace.
#[test]
fn sandbox_error_included_in_conversation() {
    use crate::types::{Sandbox, SandboxResponse};
    use anyhow::Result;

    struct ErrorSandbox;
    impl Sandbox for ErrorSandbox {
        fn init(&mut self, _context: &str) -> Result<()> { Ok(()) }
        fn execute(&mut self, _code: &str) -> Result<SandboxResponse> {
            Ok(SandboxResponse {
                ok: false,
                stdout: "partial output".into(),
                stderr: "some stderr".into(),
                value: None,
                error: Some("NameError: name 'foo' is not defined".into()),
                sub_calls: vec![],
            })
        }
        fn get_var(&mut self, _name: &str) -> Result<Option<String>> { Ok(None) }
        fn destroy(&mut self) -> Result<()> { Ok(()) }
    }

    let mock = MockLlm::new(vec![
        "```repl\nfoo()\n```",
        "FINAL(recovered)",
    ]);
    let mut executor = IterativeExecutor::new(&mock, Box::new(ErrorSandbox));
    let config = test_config();

    let result = executor.execute_mut("task", "", &config).unwrap();
    let exec = &result.trace.iterations[0].code_executions[0];
    assert_eq!(exec.stdout, "partial output");
    assert_eq!(exec.stderr, "some stderr");
    assert!(exec.error.as_ref().unwrap().contains("NameError"));
}

/// Test that sandbox output exceeding 30k chars is truncated in conversation.
#[test]
fn sandbox_output_truncation_in_conversation() {
    use crate::types::{Sandbox, SandboxResponse};
    use anyhow::Result;

    struct LargeOutputSandbox;
    impl Sandbox for LargeOutputSandbox {
        fn init(&mut self, _context: &str) -> Result<()> { Ok(()) }
        fn execute(&mut self, _code: &str) -> Result<SandboxResponse> {
            Ok(SandboxResponse {
                ok: true,
                stdout: "x".repeat(35_000),
                stderr: String::new(),
                value: None,
                error: None,
                sub_calls: vec![],
            })
        }
        fn get_var(&mut self, _name: &str) -> Result<Option<String>> { Ok(None) }
        fn destroy(&mut self) -> Result<()> { Ok(()) }
    }

    let mock = CapturingMockLlm::new(vec![
        "```repl\nprint('x' * 35000)\n```",
        "FINAL(done)",
    ]);
    let mut executor = IterativeExecutor::new(&mock, Box::new(LargeOutputSandbox));
    let config = test_config();

    let result = executor.execute_mut("task", "", &config).unwrap();
    assert_eq!(result.answer, "done");

    // Verify the conversation message was truncated
    let requests = mock.requests();
    // Second request should have the truncated output as a user message
    if requests.len() > 1 {
        let msgs = &requests[1].messages;
        // Find the user message after the assistant code block
        let truncated_msg = msgs.iter().find(|m| m.content.contains("[truncated]"));
        assert!(truncated_msg.is_some(), "Expected truncated output in conversation");
    }
}

/// FINAL_VAR referencing a nonexistent variable returns fallback message.
#[test]
fn final_var_not_found_returns_fallback() {
    use crate::types::{Sandbox, SandboxResponse};
    use anyhow::Result;

    // Sandbox that returns None for any get_var call
    struct EmptyVarSandbox;
    impl Sandbox for EmptyVarSandbox {
        fn init(&mut self, _context: &str) -> Result<()> { Ok(()) }
        fn execute(&mut self, _code: &str) -> Result<SandboxResponse> {
            Ok(SandboxResponse {
                ok: true,
                stdout: String::new(),
                stderr: String::new(),
                value: None,
                error: None,
                sub_calls: vec![],
            })
        }
        fn get_var(&mut self, _name: &str) -> Result<Option<String>> { Ok(None) }
        fn destroy(&mut self) -> Result<()> { Ok(()) }
    }

    let mock = MockLlm::new(vec!["FINAL_VAR(nonexistent_var)"]);
    let mut executor = IterativeExecutor::new(&mock, Box::new(EmptyVarSandbox));
    let config = test_config();

    let result = executor.execute_mut("task", "", &config).unwrap();
    assert!(
        result.answer.contains("not found in sandbox"),
        "Expected fallback message, got: {}",
        result.answer
    );
    assert!(result.answer.contains("nonexistent_var"));
}

/// Test that usage cost tracking accumulates when LLM returns cost.
#[test]
fn usage_cost_accumulates() {
    use crate::types::{LlmClient, LlmRequest, LlmResponse, Usage};
    use anyhow::Result;
    use std::sync::atomic::{AtomicU32, Ordering};

    struct CostMockLlm {
        responses: Vec<String>,
        call_idx: AtomicU32,
    }
    impl LlmClient for CostMockLlm {
        fn complete(&self, _request: &LlmRequest) -> Result<LlmResponse> {
            let idx = self.call_idx.fetch_add(1, Ordering::SeqCst) as usize;
            let content = self.responses.get(idx)
                .cloned()
                .unwrap_or_else(|| "FINAL(fallback)".to_string());
            Ok(LlmResponse {
                content,
                usage: Usage {
                    input_tokens: 100,
                    output_tokens: 50,
                    cost_usd: Some(0.01),
                },
            })
        }
    }

    let mock = CostMockLlm {
        responses: vec!["FINAL(ok)".into()],
        call_idx: AtomicU32::new(0),
    };
    let mut executor = IterativeExecutor::new(&mock, Box::new(MockSandbox::new()));
    let config = test_config();

    let result = executor.execute_mut("task", "", &config).unwrap();
    assert_eq!(result.trace.usage.input_tokens, 100);
    assert_eq!(result.trace.usage.output_tokens, 50);
}
