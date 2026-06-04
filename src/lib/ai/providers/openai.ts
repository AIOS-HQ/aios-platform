import type { AIProvider } from "../types";

/** OpenAI Chat Completions provider (opt-in via AI_PROVIDER=openai). */
export class OpenAIProvider implements AIProvider {
  readonly name = "openai";

  async generate(prompt: string, system?: string): Promise<string> {
    const model = process.env.AI_MODEL || "gpt-4o-mini";
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        messages: [
          ...(system ? [{ role: "system", content: system }] : []),
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI request failed: ${res.status}`);
    const data = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() ?? "";
  }
}
