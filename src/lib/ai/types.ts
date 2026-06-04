/** Life Operator types + the provider abstraction. */

export type OperatorIntent =
  | "create_task"
  | "create_goal"
  | "summarize_notes"
  | "suggest_next_steps"
  | "general";

export interface OperatorResult {
  reply: string;
  intent: OperatorIntent;
  /** Set when the Operator actually performed an action (human-visible). */
  actionTaken?: {
    type: "task_created" | "goal_created";
    label: string;
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
