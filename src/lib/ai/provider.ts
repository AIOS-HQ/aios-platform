import type { AIProvider } from "./types";
import { MockProvider } from "./providers/mock";
import { OpenAIProvider } from "./providers/openai";
import { AnthropicProvider } from "./providers/anthropic";
import { AzureProvider, resolveAzureProviderConfig } from "./providers/azure";

class UnavailableProvider implements AIProvider {
  readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  async generate(): Promise<string> {
    throw new Error("ai_provider_configuration_unavailable");
  }
}

function configuredProvider(): string {
  return process.env.AI_PROVIDER?.trim().toLowerCase() || "mock";
}

/** True when a real AI provider + key are configured. */
export function isRealProviderConfigured(): boolean {
  const provider = configuredProvider();
  if (provider === "openai") return Boolean(process.env.OPENAI_API_KEY);
  if (provider === "anthropic")
    return Boolean(process.env.ANTHROPIC_API_KEY);
  if (["azure", "azure_openai", "azure-openai"].includes(provider)) {
    return resolveAzureProviderConfig(process.env).ok;
  }
  return false;
}

/** Resolve the active provider, defaulting to the mock provider. */
export function getProvider(): AIProvider {
  const provider = configuredProvider();
  if (provider === "openai" && process.env.OPENAI_API_KEY) {
    return new OpenAIProvider();
  }
  if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
    return new AnthropicProvider();
  }
  if (["azure", "azure_openai", "azure-openai"].includes(provider)) {
    return resolveAzureProviderConfig(process.env).ok
      ? new AzureProvider()
      : new UnavailableProvider("azure");
  }
  if (provider === "mock" || provider === "openai" || provider === "anthropic") {
    return new MockProvider();
  }
  return new UnavailableProvider("unsupported");
}
