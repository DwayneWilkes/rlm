use anyhow::Result;

use crate::budget::BudgetController;
use crate::engine::parser::parse_response;
use crate::types::{
    CodeExecution, ExecutionTrace, Executor, FinalAnswer, Iteration, LlmClient, LlmRequest,
    Message, Mode, RlmConfig, RlmResult, Sandbox, Usage,
};

/// Default truncation limit for sandbox output appended to conversation.
const OUTPUT_TRUNCATION: usize = 30_000;

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

        // Bootstrap: inject a demo exchange proving the REPL protocol works.
        // The model sees this in history before its first response, establishing
        // that ```repl blocks produce real output from the sandbox.
        if !context.is_empty() {
            let bootstrap_code = r#"print(f"context_len={len(context)}")"#;
            let bootstrap_result = self.sandbox.execute(bootstrap_code)?;

            conversation.push(Message {
                role: "user".into(),
                content: "Check the context.".into(),
            });
            conversation.push(Message {
                role: "assistant".into(),
                content: format!("```repl\n{}\n```", bootstrap_code),
            });
            conversation.push(Message {
                role: "user".into(),
                content: bootstrap_result.stdout.trim().to_string(),
            });
        }

        // User message: the task + context metadata
        let task_message = if context.is_empty() {
            task.to_string()
        } else {
            format!(
                "{}\n\n[Context loaded: {} chars, ~{} words. \
                 Use `read_chunk(start, end)` to read slices without printing the entire context.]",
                task,
                context.len(),
                context.split_whitespace().count()
            )
        };
        conversation.push(Message {
            role: "user".into(),
            content: task_message,
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
    r#"[RLM: Python REPL capability]

You have access to a sandboxed Python REPL for this task. When you write Python code
in a ```repl code fence, the code is executed and the output is returned to you in the
next message. Use this to iteratively explore and analyze data.

A variable called `context` is pre-loaded in the Python environment with the input data.

Example — to check the data size:
```repl
print(len(context))
```

IMPORTANT: REPL output is truncated to 30,000 characters. For large contexts, do NOT
print the entire context at once. Use the chunked reading helpers instead.

Pre-loaded variables and helpers:
- `context` (str): The input data
- `context_len()`: Returns len(context) without printing it
- `read_chunk(start, end)`: Returns context[start:end] for reading in slices
- `parse_academic_paper(text)`: Parse academic paper into sections dict
- Full Python standard library

When you have the final answer, output it as:
FINAL(your answer here)

Or if your answer is stored in a variable:
FINAL_VAR(variable_name)

Only cite facts explicitly present in the context. If information is not available,
say so rather than guessing. Work step by step, using the REPL to explore and analyze
the data before giving your final answer."#
}
