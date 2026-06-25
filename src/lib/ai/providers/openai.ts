import type { AIProvider } from "../types";
import { aiLimits, clampPrompt } from "../limits";
import { resilientFetch, sseDataLines } from "../http";
import { recordProviderCall } from "../health";

/** OpenAI Chat Completions provider (opt-in via AI_PROVIDER=openai). */
export class OpenAIProvider implements AIProvider {
  readonly name = "openai";

  async generate(prompt: string, system?: string): Promise<string> {
    const model = process.env.AI_MODEL || "gpt-4o-mini";
    const { maxPromptChars, maxOutputTokens } = aiLimits();
    const started = Date.now();
    try {
      const res = await resilientFetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.4,
          max_tokens: maxOutputTokens,
          messages: [
            ...(system ? [{ role: "system", content: clampPrompt(system, maxPromptChars) }] : []),
            { role: "user", content: clampPrompt(prompt, maxPromptChars) },
          ],
        }),
      });
      if (!res.ok) throw new Error(`OpenAI request failed: ${res.status}`);
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content?.trim() ?? "";
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
   * Streaming variant of {@link generate}. Uses Chat Completions with
   * `stream: true` and yields each `delta.content` token. Plain `fetch` (not
   * resilientFetch) so a long stream is never aborted by the per-attempt
   * timeout; errors throw so callers fall back to `generate`.
   */
  async *generateStream(prompt: string, system?: string): AsyncGenerator<string> {
    const model = process.env.AI_MODEL || "gpt-4o-mini";
    const { maxPromptChars, maxOutputTokens } = aiLimits();
    const started = Date.now();
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.4,
          max_tokens: maxOutputTokens,
          stream: true,
          messages: [
            ...(system ? [{ role: "system", content: clampPrompt(system, maxPromptChars) }] : []),
            { role: "user", content: clampPrompt(prompt, maxPromptChars) },
          ],
        }),
      });
      if (!res.ok || !res.body) throw new Error(`OpenAI stream failed: ${res.status}`);
      for await (const data of sseDataLines(res.body)) {
        if (data === "[DONE]") break;
        try {
          const json = JSON.parse(data);
          const delta = json?.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta) yield delta;
        } catch {
          // Ignore keepalives / partial frames.
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
