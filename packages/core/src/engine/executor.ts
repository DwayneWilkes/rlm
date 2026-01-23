/**
 * @fileoverview Main execution engine for RLM tasks.
 *
 * The Executor orchestrates the iterative execution loop:
 * 1. Build system prompt with context and budget info
 * 2. Send prompt to LLM and parse response
 * 3. Execute any code blocks in the Python sandbox
 * 4. Check for FINAL/FINAL_VAR markers or continue iteration
 * 5. Handle llm_query and rlm_query bridge calls
 * 6. Force answer if budget exhausted
 *
 * @module @rlm/core/engine/executor
 */

import type {
  RLMConfig,
  ExecuteOptions,
  RLMResult,
  ExecutionTrace,
  Iteration,
} from '../types.js';
import { DEFAULT_BUDGET, DEFAULT_REPL_CONFIG } from '../types.js';
import { loadContext, escapeForPython, type LoadedContext } from '../context/loader.js';
import { createSandbox, type Sandbox, type BatchRLMTask } from '../repl/sandbox.js';
import { LLMRouter } from '../llm/router.js';
import { BudgetController } from '../budget/controller.js';
import { parseResponse } from './parser.js';
import { getModelPromptHints } from '../llm/adapters/anthropic.js';

/**
 * Executes RLM tasks with iterative LLM interaction and Python sandbox.
 *
 * The Executor manages the complete lifecycle of an RLM execution:
 * - Initializes sandbox with context
 * - Runs iteration loop until FINAL marker or budget exhaustion
 * - Handles bridge calls (llm_query, rlm_query)
 * - Builds execution trace
 * - Forces answer when budget exhausted
 *
 * @example
 * ```typescript
 * const router = new LLMRouter('ollama');
 * router.register('ollama', new OllamaAdapter());
 *
 * const executor = new Executor(config, router);
 * const result = await executor.execute({
 *   task: 'Analyze this code',
 *   context: sourceCode,
 *   budget: { maxIterations: 10 },
 * });
 * ```
 */
export class Executor {
  private config: RLMConfig;
  private router: LLMRouter;
  private depth: number;
  private parentId?: string;

  /**
   * Create a new Executor.
   *
   * @param config - RLM configuration with provider and model
   * @param router - LLM router with registered adapters
   * @param depth - Current recursion depth (0 for root, default 0)
   * @param parentId - Parent execution ID for subcalls
   */
  constructor(
    config: RLMConfig,
    router: LLMRouter,
    depth = 0,
    parentId?: string
  ) {
    this.config = config;
    this.router = router;
    this.depth = depth;
    this.parentId = parentId;
  }

  /**
   * Execute an RLM task.
   *
   * Runs the iterative execution loop, handling code execution,
   * bridge calls, and budget enforcement.
   *
   * @param options - Execution options including task, context, budget, and hooks
   * @returns RLMResult with output, trace, usage, and warnings
   */
  async execute(options: ExecuteOptions): Promise<RLMResult> {
    const executionId = crypto.randomUUID();
    const warnings: string[] = [];

    // Initialize budget controller with merged budgets
    const budget = new BudgetController(
      { ...DEFAULT_BUDGET, ...this.config.defaultBudget, ...options.budget },
      (warning) => {
        warnings.push(warning);
        options.hooks?.onBudgetWarning?.(warning);
      }
    );

    // Initialize trace
    const trace: ExecutionTrace = {
      id: executionId,
      parentId: this.parentId,
      depth: this.depth,
      task: options.task,
      iterations: [],
      subcalls: [],
      finalAnswer: '',
      answerSource: 'forced',
    };

    // Load context
    const context = loadContext(options.context);

    // Create sandbox with bridges
    const replConfig = { ...DEFAULT_REPL_CONFIG, ...this.config.repl };
    const bridges = {
      onLLMQuery: async (prompt: string) => {
        const subcallProvider = this.config.subcallProvider ?? this.config.provider;
        const response = await this.router.complete(subcallProvider, {
          model: this.config.subcallModel ?? this.config.model,
          systemPrompt: 'You are a helpful assistant. Be concise.',
          userPrompt: prompt,
        });
        budget.record({
          cost: response.cost,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
        });
        return response.content;
      },
      onRLMQuery: async (task: string, ctx?: string) => {
        if (!budget.canProceed('subcall', this.depth + 1)) {
          return (
            `[Cannot spawn sub-RLM: ${budget.getBlockReason()}. Answering directly.]\n` +
            (await this.directAnswer(task, ctx ?? options.context))
          );
        }

        options.hooks?.onSubcall?.({ depth: this.depth + 1, task });
        budget.record({ subcall: true, depth: this.depth + 1 });

        const subExecutor = new Executor(
          {
            ...this.config,
            defaultBudget: budget.getSubBudget(this.depth),
          },
          this.router,
          this.depth + 1,
          executionId
        );

        const subResult = await subExecutor.execute({
          task,
          context: ctx ?? options.context,
          hooks: options.hooks,
        });

        trace.subcalls.push(subResult.trace);
        budget.record({
          cost: subResult.usage.cost,
          inputTokens: subResult.usage.inputTokens,
          outputTokens: subResult.usage.outputTokens,
        });

        return subResult.output;
      },
      onBatchRLMQuery: async (tasks: BatchRLMTask[]) => {
        // Check if batch would exceed budget before spawning any
        if (tasks.length === 0) {
          return [];
        }

        // Respect configured batch concurrency (default 5)
        const concurrency = budget.getBatchConcurrency();
        const results: string[] = new Array(tasks.length);
        const queue = tasks.map((t: BatchRLMTask, i: number) => ({ ...t, index: i }));

        // Process queue with limited concurrency
        const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
          while (queue.length > 0) {
            const item = queue.shift();
            if (!item) break;

            try {
              if (!budget.canProceed('subcall', this.depth + 1)) {
                results[item.index] =
                  `[Cannot spawn sub-RLM: ${budget.getBlockReason()}. Answering directly.]\n` +
                  (await this.directAnswer(item.task, item.context ?? options.context));
                continue;
              }

              options.hooks?.onSubcall?.({ depth: this.depth + 1, task: item.task });
              budget.record({ subcall: true, depth: this.depth + 1 });

              const subExecutor = new Executor(
                {
                  ...this.config,
                  defaultBudget: budget.getSubBudget(this.depth),
                },
                this.router,
                this.depth + 1,
                executionId
              );

              const subResult = await subExecutor.execute({
                task: item.task,
                context: item.context ?? options.context,
                hooks: options.hooks,
              });

              trace.subcalls.push(subResult.trace);
              budget.record({
                cost: subResult.usage.cost,
                inputTokens: subResult.usage.inputTokens,
                outputTokens: subResult.usage.outputTokens,
              });

              // Handle sub-executor failures gracefully
              if (subResult.success) {
                results[item.index] = subResult.output;
              } else {
                const errorMsg = subResult.error?.message ?? 'Unknown error';
                results[item.index] = `[Error: ${errorMsg}]`;
              }
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              results[item.index] = `[Error: ${errorMessage}]`;
            }
          }
        });

        await Promise.all(workers);
        return results;
      },
    };

    // Use injected sandboxFactory if provided, otherwise use default Pyodide sandbox.
    // CLI injects native/daemon backends; core users get Pyodide fallback.
    const sandbox = this.config.sandboxFactory
      ? this.config.sandboxFactory(replConfig, bridges)
      : createSandbox(replConfig, bridges);

    try {
      await sandbox.initialize(escapeForPython(options.context));

      // Build system prompt
      const systemPrompt = this.buildSystemPrompt(context, budget);
      let conversationContext = '';

      // Main execution loop
      while (budget.canProceed('iteration')) {
        budget.record({ iteration: true });

        // Build user prompt
        const userPrompt =
          trace.iterations.length === 0
            ? this.buildInitialPrompt(options.task, context)
            : conversationContext;

        // Call LLM
        const response = await this.router.complete(this.config.provider, {
          model: this.config.model,
          systemPrompt,
          userPrompt,
          maxTokens: 8192,
        });

        budget.record({
          cost: response.cost,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
        });

        // Parse response
        const parsed = parseResponse(response.content);

        // Create iteration record
        const iteration: Iteration = {
          index: trace.iterations.length,
          prompt: {
            content: userPrompt,
            tokens: response.inputTokens,
          },
          response: {
            content: response.content,
            tokens: response.outputTokens,
            cost: response.cost,
          },
          codeExecutions: [],
        };

        // Execute code blocks
        let executionOutput = '';
        for (const code of parsed.codeBlocks) {
          const result = await sandbox.execute(code);
          iteration.codeExecutions.push(result);

          if (result.error) {
            executionOutput += `\n[Error]: ${result.error}`;
          } else if (result.stdout) {
            executionOutput += `\n[Output]:\n${result.stdout}`;
          }
        }

        trace.iterations.push(iteration);
        options.hooks?.onIteration?.(iteration);

        // Check for final answer
        if (parsed.finalAnswer) {
          if (parsed.finalAnswer.type === 'variable') {
            const value = await sandbox.getVariable(parsed.finalAnswer.value);
            trace.finalAnswer = String(value ?? '[Variable not found]');
            trace.answerSource = 'final_var';
          } else {
            trace.finalAnswer = parsed.finalAnswer.value;
            trace.answerSource = 'final_direct';
          }
          break;
        }

        // Build context for next iteration
        conversationContext = `Previous response:\n${response.content}\n\nExecution results:${executionOutput || '\n[No output]'}\n\nContinue your analysis or provide FINAL(answer) when ready.`;
      }

      // Force answer if we ran out of budget
      if (!trace.finalAnswer) {
        trace.finalAnswer = await this.forceAnswer(
          options.task,
          trace.iterations,
          budget
        );
        trace.answerSource = 'forced';
        warnings.push('Budget exhausted, answer was forced');
      }

      return {
        success: true,
        output: trace.finalAnswer,
        trace,
        usage: budget.getUsage(),
        warnings,
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        trace,
        usage: budget.getUsage(),
        warnings,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    } finally {
      await sandbox.destroy();
    }
  }

  /**
   * Build the system prompt with environment description and budget info.
   * For sub-RLMs (depth > 0), includes additional context about being a sub-call
   * and efficiency guidelines.
   */
  private buildSystemPrompt(
    context: LoadedContext,
    budget: BudgetController
  ): string {
    const remaining = budget.getRemaining();

    // Base prompt for root RLM
    const basePrompt = `You are an RLM (Recursive Language Model). You solve complex tasks by examining context, executing Python code, and delegating sub-tasks.

ENVIRONMENT:
- \`context\`: String variable with your input (${context.length.toLocaleString()} chars, ${context.contentType})
- \`llm_query(prompt)\`: Query an LLM for simple tasks
- \`rlm_query(task, ctx?)\`: Spawn a sub-RLM for complex sub-tasks (PREFERRED for multi-step reasoning)
- \`batch_llm_query(prompts)\`: Execute multiple LLM queries in parallel, returns list of responses
- \`batch_rlm_query(tasks)\`: Execute multiple sub-RLMs concurrently, tasks=[{"task": str, "context"?: str}, ...]
- \`chunk_text(text, size, overlap)\`: Split text into chunks
- \`search_context(pattern, window)\`: Regex search with context
- \`count_matches(pattern)\`: Fast count of regex matches
- \`extract_json(text)\`: Safely extract JSON from text
- \`extract_sections(pattern)\`: Extract sections by header pattern
- \`find_line(pattern)\`: Find lines matching regex, returns [(line_num, content), ...]
- \`count_lines(pattern?)\`: Count total lines, or lines matching pattern
- \`get_line(n)\`: Get content of line n (1-indexed)
- \`quote_match(pattern)\`: Return first match of pattern in context
- \`chunk_by_headers(level=2)\`: Split context by Markdown headers (# for 1, ## for 2, etc.)
- \`chunk_by_size(chars=50000, overlap=0)\`: Split context into fixed-size chunks

ACCURACY (CRITICAL):
- Check the content of the 'context' variable to avoid hallucinations
- ALWAYS quote exact text when referencing code or data
- Use find_line() to verify line numbers before citing them
- Use count_lines() for accurate counts, not estimates
- NEVER assume values from memory - verify against actual context
- If you cannot find evidence, say "not found in context"

BUDGET:
- Remaining: $${remaining.cost.toFixed(2)} | ${remaining.iterations} iterations | depth ${this.depth}/${budget.getRemaining().depth + this.depth}

EXECUTION:
Write Python in \`\`\`repl blocks. Multiple blocks in one response execute sequentially and share state - this is MORE EFFICIENT than multiple iterations.

\`\`\`repl
# Batch multiple operations in one response (1 LLM call)
print(len(context))
results = search_context("important", window=100)
for r in results[:5]:
    print(r['match'], r['start'])
\`\`\`

\`\`\`repl
# Build on previous results
summary = f"Found {len(results)} matches"
print(summary)
\`\`\`

STRATEGY:
1. First examine context structure (print samples, check length)
2. Batch multiple operations in one response when possible
3. Use count_matches() before full search to estimate scope
4. For complex sub-tasks, use rlm_query() - it has its own REPL
5. Build answers incrementally in variables
6. VERIFY claims before stating them:
   # Bad: "The method query() on line 41..."
   # Good: Use find_line() first, then cite verified results
   matches = find_line("def.*complete")
   # Output: [(87, "  async def complete(request):")]
   # Then cite: "The method complete() on line 87"

BATCHING: When you need to analyze multiple chunks independently:
- Use batch_rlm_query() instead of sequential rlm_query() calls
- Aim for ~200k chars per sub-call for optimal cost/quality
- Example: batch_rlm_query([{"task": "Summarize section 1", "context": chunk1}, ...])

CHUNKING: Choose the right chunking strategy for your context:
- \`chunk_by_headers(level=2)\`: Best for structured docs with headers (README, specs, docs)
  Example: chunks = chunk_by_headers(2); batch_rlm_query([{"task": f"Summarize", "context": c['content']} for c in chunks])
- \`chunk_by_size(chars, overlap)\`: Best for unstructured text or code
  Example: chunks = chunk_by_size(100000, 500); [rlm_query("Analyze", ctx=c) for c in chunks]
- Combine with batch_rlm_query() for parallel processing of chunks

${this.buildModelHintsSection()}TERMINATION (use when ready):
- FINAL(your answer here) - Direct answer
- FINAL_VAR(variable_name) - Return variable contents`;

    // For sub-RLMs, prepend context about their role and budget
    if (this.depth > 0) {
      const allocatedDesc = budget.getAllocatedBudgetDescription(this.depth);
      const maxDepth = remaining.depth + this.depth;

      const subRLMContext = `[SUB-RLM CONTEXT]
You are a SUB-RLM at depth ${this.depth}/${maxDepth}.
You were spawned by a parent RLM to handle a specific sub-task.

ALLOCATED BUDGET:
${allocatedDesc}

EFFICIENCY GUIDELINES:
- Your budget is LIMITED - be strategic, not exhaustive
- Prefer llm_query() over rlm_query() unless truly necessary
- Aim to complete in 2-5 iterations, not 10+
- Return FINAL() as soon as you have a reasonable answer

`;
      return subRLMContext + basePrompt;
    }

    return basePrompt;
  }

  /**
   * Build the MODEL HINTS section for the system prompt.
   * Combines hints from config (profile-level overrides) and model capabilities.
   *
   * Config hints take precedence over model capability hints.
   */
  private buildModelHintsSection(): string {
    // Config hints take precedence (profile-level overrides)
    const configHints = this.config.promptHints;
    // Fall back to model capability hints
    const modelHints = getModelPromptHints(this.config.model);

    // Use config hints if provided, otherwise model hints
    const hints = configHints && configHints.length > 0 ? configHints : modelHints;

    if (hints.length === 0) {
      return '';
    }

    const hintsText = hints.map((hint) => `- ${hint}`).join('\n');
    return `MODEL HINTS (for ${this.config.model}):
${hintsText}

`;
  }

  /**
   * Build the initial user prompt with task and context preview.
   */
  private buildInitialPrompt(task: string, context: LoadedContext): string {
    const preview = context.content.slice(0, 2000);
    const truncated = context.content.length > 2000 ? '...[truncated]' : '';

    return `TASK: ${task}

CONTEXT PREVIEW (${context.length.toLocaleString()} chars total):
${preview}${truncated}

Begin by examining the context, then work toward answering the task.`;
  }

  /**
   * Get a direct answer for a task without spawning a full RLM.
   * Used when budget doesn't allow subcalls.
   */
  private async directAnswer(task: string, context: string): Promise<string> {
    const preview = context.slice(0, 10000);
    const subcallProvider = this.config.subcallProvider ?? this.config.provider;
    const response = await this.router.complete(subcallProvider, {
      model: this.config.subcallModel ?? this.config.model,
      systemPrompt: 'Answer concisely based on the context provided.',
      userPrompt: `Context:\n${preview}\n\nTask: ${task}`,
    });
    return response.content;
  }

  /**
   * Force an answer when budget is exhausted.
   * Requests a summary based on work done so far.
   */
  private async forceAnswer(
    task: string,
    iterations: Iteration[],
    budget: BudgetController
  ): Promise<string> {
    // Try to extract any accumulated information
    const lastIteration = iterations[iterations.length - 1];
    const lastOutput = lastIteration?.codeExecutions
      .map((e) => e.stdout || e.error)
      .filter(Boolean)
      .join('\n');

    const response = await this.router.complete(this.config.provider, {
      model: this.config.model,
      systemPrompt: 'Provide your best answer based on the work done so far.',
      userPrompt: `Original task: ${task}\n\nLast execution output:\n${lastOutput || '[none]'}\n\nProvide your best answer now.`,
      maxTokens: 2048,
    });

    budget.record({
      cost: response.cost,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
    });

    return response.content;
  }
}
