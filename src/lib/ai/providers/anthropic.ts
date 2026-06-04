import type { AIProvider } from "../types";

/** Anthropic Messages provider (opt-in via AI_PROVIDER=anthropic). */
export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";

  async generate(prompt: string, system?: string): Promise<string> {
    const model = process.env.AI_MODEL || "claude-3-5-haiku-latest";
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        ...(system ? { system } : {}),
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic request failed: ${res.status}`);
    const data = await res.json();
    return data?.content?.[0]?.text?.trim() ?? "";
  }
}
