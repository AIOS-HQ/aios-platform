import type { AIProvider } from "../types";

/**
 * Default, no-cost provider. It performs no external calls. The Life Operator
 * handles structured intents (create task/goal, summarize, suggest) with
 * transparent rule-based logic and only falls back to a provider for free-form
 * "general" prompts — so this mock is intentionally simple.
 */
export class MockProvider implements AIProvider {
  readonly name = "mock";

  async generate(prompt: string): Promise<string> {
    return `Mock assistant — configure AI_PROVIDER and an API key to enable AI responses. You said: "${prompt.slice(0, 200)}"`;
  }

  /**
   * Streaming variant: chunks the canned reply word-by-word so the UI can
   * exercise the streaming path end-to-end with no API key configured.
   */
  async *generateStream(prompt: string): AsyncGenerator<string> {
    const full = await this.generate(prompt);
    for (const chunk of full.match(/\S+\s*/g) ?? [full]) {
      yield chunk;
      await new Promise((r) => setTimeout(r, 12));
    }
  }
}
