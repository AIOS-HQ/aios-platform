import { env } from "@/lib/env";
import type { AIProvider } from "./types";
import { MockProvider } from "./providers/mock";
import { OpenAIProvider } from "./providers/openai";
import { AnthropicProvider } from "./providers/anthropic";

/** True when a real AI provider + key are configured. */
export function isRealProviderConfigured(): boolean {
  if (env.aiProvider === "openai") return Boolean(process.env.OPENAI_API_KEY);
  if (env.aiProvider === "anthropic")
    return Boolean(process.env.ANTHROPIC_API_KEY);
  return false;
}

/** Resolve the active provider, defaulting to the mock provider. */
export function getProvider(): AIProvider {
  if (env.aiProvider === "openai" && process.env.OPENAI_API_KEY) {
    return new OpenAIProvider();
  }
  if (env.aiProvider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
    return new AnthropicProvider();
  }
  return new MockProvider();
}
