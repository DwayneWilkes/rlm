use anyhow::Result;

use crate::budget::BudgetController;
use crate::engine::parser::parse_response;
use crate::types::{
    CodeExecution, ExecutionTrace, Executor, FinalAnswer, Iteration, LlmClient, LlmRequest,
    Message, Mode, RlmConfig, RlmResult, Sandbox, Usage,
};

/// Default truncation limit for sandbox output appended to conversation.
const OUTPUT_TRUNCATION: usize = 10_000;

/// Executes a task using the iterative REPL loop (Zhang et al. 2025 algorithm).
pub struct IterativeExecutor<'a> {
    client: &'a dyn LlmClient,
    sandbox: Box<dyn Sandbox>,
}

impl<'a> IterativeExecutor<'a> {
    pub fn new(client: &'a dyn LlmClient, sandbox: Box<dyn Sandbox>) -> Self {
        Self { client, sandbox }
    }
}

impl<'a> Executor for IterativeExecutor<'a> {
    fn execute(&self, _task: &str, _context: &str, _config: &RlmConfig) -> Result<RlmResult> {
        // This is a simplified version — the real impl needs &mut self for sandbox.
        // For now, we provide the algorithm structure. The actual wiring will use
        // interior mutability or a different ownership pattern.
        Err(anyhow::anyhow!(
            "IterativeExecutor::execute requires mutable sandbox access — use execute_mut instead"
        ))
    }
}

impl<'a> IterativeExecutor<'a> {
    /// The real iterative execution with mutable sandbox access.
    pub fn execute_mut(
        &mut self,
        task: &str,
        context: &str,
        config: &RlmConfig,
    ) -> Result<RlmResult> {
        let mut budget = BudgetController::new(config.budget.clone());
        let mut total_usage = Usage::default();
        let mut iterations = Vec::new();
        let mut conversation = Vec::new();

        // Initialize sandbox with context
        self.sandbox.init(context)?;

        // Build system prompt
        let system_prompt = default_iterative_system_prompt().to_string();

        // First user message: the task
        conversation.push(Message {
            role: "user".into(),
            content: task.to_string(),
        });

        let mut final_answer = None;

        loop {
            // Check budget before each iteration
            if let Some(reason) = budget.check() {
                return Ok(RlmResult {
                    answer: final_answer
                        .unwrap_or_else(|| "[Budget exhausted before completion]".to_string()),
                    trace: ExecutionTrace {
                        mode: Some(Mode::Iterative),
                        iterations,
                        usage: total_usage,
                        budget_exhausted: Some(reason),
                    },
                    synthesis: None,
                });
            }

            budget.tick_iteration();

            // Build LLM request
            let request = LlmRequest {
                model: config.provider.model().to_string(),
                messages: conversation.clone(),
                system: Some(system_prompt.clone()),
                inference: config.inference.clone(),
            };

            // Call LLM
            let response = self.client.complete(&request)?;
            budget.record_tokens(response.usage.input_tokens, response.usage.output_tokens);
            if let Some(cost) = response.usage.cost_usd {
                budget.record_cost(cost);
            }
            total_usage.input_tokens += response.usage.input_tokens;
            total_usage.output_tokens += response.usage.output_tokens;

            // Parse the response
            let parsed = parse_response(&response.content);

            let mut iter_code_executions = Vec::new();

            // Add assistant response to conversation
            conversation.push(Message {
                role: "assistant".into(),
                content: response.content.clone(),
            });

            // Check for FINAL marker
            if let Some(answer) = &parsed.final_answer {
                final_answer = Some(match answer {
                    FinalAnswer::Literal(s) => s.clone(),
                    FinalAnswer::VarName(name) => {
                        self.sandbox.get_var(name)?.unwrap_or_else(|| {
                            format!("[Variable '{}' not found in sandbox]", name)
                        })
                    }
                });
            }

            // Execute code blocks
            for code in &parsed.code_blocks {
                let start = std::time::Instant::now();
                let exec_result = self.sandbox.execute(code)?;
                let duration_ms = start.elapsed().as_millis() as u64;

                let mut output = String::new();
                if !exec_result.stdout.is_empty() {
                    output.push_str(&exec_result.stdout);
                }
                if !exec_result.stderr.is_empty() {
                    if !output.is_empty() {
                        output.push('\n');
                    }
                    output.push_str("[stderr] ");
                    output.push_str(&exec_result.stderr);
                }
                if let Some(err) = &exec_result.error {
                    if !output.is_empty() {
                        output.push('\n');
                    }
                    output.push_str("[error] ");
                    output.push_str(err);
                }

                // Truncate output for conversation
                let truncated = if output.len() > OUTPUT_TRUNCATION {
                    format!("{}...\n[truncated]", &output[..OUTPUT_TRUNCATION])
                } else {
                    output.clone()
                };

                // Add execution output as user message
                if !truncated.is_empty() {
                    conversation.push(Message {
                        role: "user".into(),
                        content: truncated,
                    });
                }

                iter_code_executions.push(CodeExecution {
                    code: code.clone(),
                    stdout: exec_result.stdout,
                    stderr: exec_result.stderr,
                    error: exec_result.error,
                    duration_ms,
                });
            }

            iterations.push(Iteration {
                index: iterations.len() as u32,
                llm_response: response.content,
                code_executions: iter_code_executions,
                sub_calls: vec![],
            });

            // If we got a FINAL answer, we're done
            if final_answer.is_some() {
                break;
            }

            // If no code blocks and no FINAL, the model is just reasoning.
            // Continue the loop (the model should eventually emit code or FINAL).
        }

        let answer = final_answer.unwrap_or_else(|| "[No FINAL answer produced]".to_string());

        // Synthesis pass if enabled
        let synthesis = if config.synthesize {
            let synth_request = LlmRequest {
                model: config.provider.model().to_string(),
                messages: vec![Message {
                    role: "user".into(),
                    content: format!(
                        "Synthesize and consolidate the following extracted information into a coherent summary:\n\n{}",
                        answer
                    ),
                }],
                system: Some("You are a synthesis assistant. Consolidate the provided information into a clear, well-organized summary.".into()),
                inference: config.inference.clone(),
            };
            let synth_response = self.client.complete(&synth_request)?;
            total_usage.input_tokens += synth_response.usage.input_tokens;
            total_usage.output_tokens += synth_response.usage.output_tokens;
            Some(synth_response.content)
        } else {
            None
        };

        Ok(RlmResult {
            answer,
            trace: ExecutionTrace {
                mode: Some(Mode::Iterative),
                iterations,
                usage: total_usage,
                budget_exhausted: None,
            },
            synthesis,
        })
    }
}

fn default_iterative_system_prompt() -> &'static str {
    r#"You are an RLM (Recursive Language Model) assistant with access to a Python REPL.

The variable `context` contains the input data you need to analyze.

To execute Python code, write it in a ```repl code fence:
```repl
print(len(context))
```

The code will be executed and you'll see the output. You can use this to iteratively analyze the data.

Available in the sandbox:
- `context` (str): The input data
- `parse_academic_paper(text)`: Parse academic paper into sections
- Full Python standard library

When you have the final answer, output it as:
FINAL(your answer here)

Or if your answer is stored in a variable:
FINAL_VAR(variable_name)

Work step by step, using the REPL to explore and analyze the data before giving your final answer."#
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{Budget, InferenceOptions, LlmResponse, ProviderConfig, SandboxResponse};
    use std::collections::HashMap;

    struct MockLlm {
        responses: Vec<String>,
        call_idx: std::sync::atomic::AtomicU32,
    }

    impl MockLlm {
        fn new(responses: Vec<&str>) -> Self {
            Self {
                responses: responses.into_iter().map(String::from).collect(),
                call_idx: std::sync::atomic::AtomicU32::new(0),
            }
        }
    }

    impl LlmClient for MockLlm {
        fn complete(&self, _request: &LlmRequest) -> Result<LlmResponse> {
            let idx = self
                .call_idx
                .fetch_add(1, std::sync::atomic::Ordering::SeqCst) as usize;
            let content = self
                .responses
                .get(idx)
                .cloned()
                .unwrap_or_else(|| "FINAL(fallback)".to_string());
            Ok(LlmResponse {
                content,
                usage: Usage {
                    input_tokens: 100,
                    output_tokens: 50,
                    cost_usd: None,
                },
            })
        }
    }

    struct MockSandbox {
        vars: HashMap<String, String>,
    }

    impl MockSandbox {
        fn new() -> Self {
            Self {
                vars: HashMap::new(),
            }
        }
    }

    impl Sandbox for MockSandbox {
        fn init(&mut self, context: &str) -> Result<()> {
            self.vars.insert("context".into(), context.into());
            Ok(())
        }

        fn execute(&mut self, code: &str) -> Result<SandboxResponse> {
            // Simulate basic execution
            let stdout = if code.contains("print") {
                "mock output\n".to_string()
            } else if code.contains("result =") {
                self.vars.insert("result".into(), "computed_value".into());
                String::new()
            } else {
                String::new()
            };

            Ok(SandboxResponse {
                ok: true,
                stdout,
                stderr: String::new(),
                value: None,
                error: None,
                sub_calls: vec![],
            })
        }

        fn get_var(&mut self, name: &str) -> Result<Option<String>> {
            Ok(self.vars.get(name).cloned())
        }

        fn destroy(&mut self) -> Result<()> {
            Ok(())
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
            budget: Budget {
                max_iterations: 10,
                max_time_seconds: 300,
                ..Budget::default()
            },
            mode: Mode::Iterative,
            template: None,
            synthesize: false,
            model_hints: HashMap::new(),
            templates_dir: None,
        }
    }

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
}
