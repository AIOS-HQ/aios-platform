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
  generate(prompt: string, system?: string): Promise<string>;
}
