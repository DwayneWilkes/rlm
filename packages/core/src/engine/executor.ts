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
import { createSandbox, type Sandbox } from '../repl/sandbox.js';
import { LLMRouter } from '../llm/router.js';
import { BudgetController } from '../budget/controller.js';
import { parseResponse } from './parser.js';

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
    const sandbox = createSandbox(replConfig, {
      onLLMQuery: async (prompt) => {
        const response = await this.router.complete(this.config.provider, {
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
      onRLMQuery: async (task, ctx) => {
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
    });

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
- \`chunk_text(text, size, overlap)\`: Split text into chunks
- \`search_context(pattern, window)\`: Regex search with context

BUDGET:
- Remaining: $${remaining.cost.toFixed(2)} | ${remaining.iterations} iterations | depth ${this.depth}/${budget.getRemaining().depth + this.depth}

EXECUTION:
Write Python in \`\`\`repl blocks:
\`\`\`repl
print(len(context))
results = search_context("important", window=100)
print(results[:3])
\`\`\`

STRATEGY:
1. First examine context structure (print samples, check length)
2. For complex sub-tasks, use rlm_query() - it has its own REPL
3. Build answers incrementally in variables
4. Be budget-conscious: batch operations

TERMINATION (use when ready):
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
    const response = await this.router.complete(this.config.provider, {
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
