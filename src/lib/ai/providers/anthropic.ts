import type { AIProvider } from "../types";
import { aiLimits, clampPrompt } from "../limits";
import { resilientFetch, sseDataLines } from "../http";
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

  /**
   * Streaming variant of {@link generate}. Uses the Messages API with
   * `stream: true` and yields each `content_block_delta` text token. Plain
   * `fetch` (not resilientFetch) so a long stream is never aborted by the
   * per-attempt timeout; errors throw so callers fall back to `generate`.
   */
  async *generateStream(prompt: string, system?: string): AsyncGenerator<string> {
    const model = process.env.AI_MODEL || "claude-3-5-haiku-latest";
    const { maxPromptChars, maxOutputTokens } = aiLimits();
    const started = Date.now();
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxOutputTokens,
          stream: true,
          ...(system ? { system: clampPrompt(system, maxPromptChars) } : {}),
          messages: [{ role: "user", content: clampPrompt(prompt, maxPromptChars) }],
        }),
      });
      if (!res.ok || !res.body) throw new Error(`Anthropic stream failed: ${res.status}`);
      for await (const data of sseDataLines(res.body)) {
        try {
          const json = JSON.parse(data);
          if (json?.type === "content_block_delta") {
            const delta = json?.delta?.text;
            if (typeof delta === "string" && delta) yield delta;
          }
        } catch {
          // Ignore ping/non-JSON frames.
        }
      }
      recordProviderCall({ provider: this.name, ok: true, latencyMs: Date.now() - started });
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
