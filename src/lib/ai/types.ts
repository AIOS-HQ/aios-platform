/** Life Operator types + the provider abstraction. */

export type OperatorIntent =
  | "create_task"
  | "create_goal"
  | "summarize_notes"
  | "suggest_next_steps"
  | "execution_request"
  | "general";

export interface OperatorResult {
  reply: string;
  intent: OperatorIntent;
  /** Set when the Operator actually performed an action (human-visible). */
  actionTaken?: {
    type: "task_created" | "goal_created" | "work_delegated";
    label: string;
  };
  /**
   * A write the Operator wants to make but has NOT executed yet. The UI shows a
   * confirm step; only on confirmation is it performed (human in control).
   */
  proposedAction?: {
    type: "create_task" | "create_goal";
    title: string;
  };
}

/**
 * Pluggable text-generation provider. The mock provider is the default so the
 * Life Operator works with no API keys; OpenAI/Anthropic are opt-in via env.
 */
export interface AIProvider {
  readonly name: string;
  generate(
    prompt: string,
    system?: string,
    options?: { signal?: AbortSignal },
  ): Promise<string>;
  /**
   * Optional streaming completion: yields incremental text deltas where the
   * concatenation of all deltas equals the full reply. Providers (or runtimes)
   * that don't support streaming simply omit this, and callers fall back to
   * `generate`. Errors are thrown so callers can fall back gracefully. This is
   * the provider foundation for Streaming Harmony; only Harmony's free-form
   * generative replies stream — structured, confirm-before-write actions never do.
   */
  generateStream?(prompt: string, system?: string): AsyncIterable<string>;
}
