import type { AIProvider } from "../types";
import { aiLimits, clampPrompt } from "../limits";
import { resilientFetch } from "../http";
import { recordProviderCall } from "../health";

/** Anthropic Messages provider (opt-in via AI_PROVIDER=anthropic). */
export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";

  async generate(prompt: string, system?: string): Promise<string> {
    const model = process.env.AI_MODEL || "claude-3-5-haiku-latest";
    const { maxPromptChars, maxOutputTokens } = aiLimits();
    const started = Date.now();
    try {
      const res = await resilientFetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxOutputTokens,
          ...(system ? { system: clampPrompt(system, maxPromptChars) } : {}),
          messages: [{ role: "user", content: clampPrompt(prompt, maxPromptChars) }],
        }),
      });
      if (!res.ok) throw new Error(`Anthropic request failed: ${res.status}`);
      const data = await res.json();
      const text = data?.content?.[0]?.text?.trim() ?? "";
      recordProviderCall({ provider: this.name, ok: true, latencyMs: Date.now() - started });
      return text;
    } catch (err) {
      recordProviderCall({
        provider: this.name,
        ok: false,
        latencyMs: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }
}
