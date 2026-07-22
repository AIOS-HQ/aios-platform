import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getProvider, isRealProviderConfigured } from "@/lib/ai/provider";
import {
  AzureProvider,
  AzureProviderError,
  createAzureResponsesRequest,
  extractAzureResponseText,
  resolveAzureProviderConfig,
} from "@/lib/ai/providers/azure";

const ORIGINAL_ENV = { ...process.env };
const endpoint = "https://aios-harmony.openai.azure.com";

function azureEnvironment(overrides: Record<string, string | undefined> = {}) {
  return {
    AI_PROVIDER: "azure",
    AI_MODEL: "gpt-5.6-sol",
    AZURE_OPENAI_ENDPOINT: endpoint,
    AZURE_OPENAI_API_KEY: "test-only-secret-key",
    ...overrides,
  };
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("Azure provider configuration", () => {
  it("selects Azure explicitly without substituting OpenAI", () => {
    Object.assign(process.env, azureEnvironment());
    expect(isRealProviderConfigured()).toBe(true);
    expect(getProvider()).toBeInstanceOf(AzureProvider);
    expect(getProvider().name).toBe("azure");
  });

  it("does not replace incomplete Azure configuration with the mock provider", async () => {
    Object.assign(process.env, azureEnvironment());
    delete process.env.AZURE_OPENAI_API_KEY;
    expect(isRealProviderConfigured()).toBe(false);
    const provider = getProvider();
    expect(provider.name).toBe("azure");
    await expect(provider.generate("ignored")).rejects.toThrow(
      "ai_provider_configuration_unavailable",
    );
  });

  it("keeps OpenAI and Anthropic provider selection compatible", () => {
    process.env.AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "configured";
    expect(getProvider().name).toBe("openai");

    process.env.AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "configured";
    expect(getProvider().name).toBe("anthropic");
  });

  it("keeps an absent provider deterministic and rejects unsupported providers", async () => {
    delete process.env.AI_PROVIDER;
    expect(getProvider().name).toBe("mock");

    process.env.AI_PROVIDER = "not-a-provider";
    const unsupported = getProvider();
    expect(unsupported.name).toBe("unsupported");
    await expect(unsupported.generate("ignored")).rejects.toThrow(
      "ai_provider_configuration_unavailable",
    );
  });

  it.each([
    ["endpoint", { AZURE_OPENAI_ENDPOINT: undefined }, "azure_configuration_missing_endpoint"],
    ["key", { AZURE_OPENAI_API_KEY: undefined }, "azure_configuration_missing_api_key"],
    ["deployment", { AI_MODEL: undefined }, "azure_configuration_missing_deployment"],
    ["invalid deployment", { AI_MODEL: "https://secret.invalid/model" }, "azure_configuration_invalid_deployment"],
  ])("fails closed for missing or invalid %s", (_label, overrides, code) => {
    const result = resolveAzureProviderConfig(azureEnvironment(overrides));
    expect(result).toMatchObject({ ok: false, code });
    expect(JSON.stringify(result)).not.toContain("test-only-secret-key");
  });

  it("normalizes only supported Azure HTTPS endpoints", () => {
    const result = resolveAzureProviderConfig(azureEnvironment({
      AZURE_OPENAI_ENDPOINT: `${endpoint}/openai/v1/`,
    }));
    expect(result).toMatchObject({
      ok: true,
      config: {
        endpointHostname: "aios-harmony.openai.azure.com",
        deploymentName: "gpt-5.6-sol",
        responsesUrl: `${endpoint}/openai/v1/responses`,
      },
    });

    for (const invalid of [
      "http://aios-harmony.openai.azure.com",
      "https://user:secret@aios-harmony.openai.azure.com",
      "https://aios-harmony.openai.azure.com?api-key=secret",
      "https://example.com",
      "https://aios-harmony.openai.azure.com/custom/path",
    ]) {
      expect(resolveAzureProviderConfig(azureEnvironment({
        AZURE_OPENAI_ENDPOINT: invalid,
      }))).toMatchObject({
        ok: false,
        code: "azure_configuration_invalid_endpoint",
      });
    }
  });
});

describe("Azure Responses API transport", () => {
  it("constructs the Responses request and parses valid response shapes", () => {
    const resolved = resolveAzureProviderConfig(azureEnvironment());
    if (!resolved.ok) throw new Error("fixture configuration failed");
    const request = createAzureResponsesRequest({
      config: resolved.config,
      prompt: "safe request",
      system: "safe system",
      maxPromptChars: 100,
      maxOutputTokens: 32,
    });
    expect(request.url).toBe(`${endpoint}/openai/v1/responses`);
    expect(request.init.headers).toMatchObject({ "api-key": "test-only-secret-key" });
    expect(JSON.parse(String(request.init.body))).toMatchObject({
      model: "gpt-5.6-sol",
      input: "safe request",
      instructions: "safe system",
      max_output_tokens: 32,
    });
    expect(extractAzureResponseText({ output_text: "OK" })).toBe("OK");
    expect(extractAzureResponseText({
      output: [{ content: [{ type: "output_text", text: "nested" }] }],
    })).toBe("nested");
    expect(extractAzureResponseText({ output: [] })).toBeNull();
  });

  it("returns application text without adding a persistence path", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      output: [{ content: [{ type: "output_text", text: "generated result" }] }],
    }), { status: 200 })) as typeof fetch;
    const provider = new AzureProvider(azureEnvironment(), {
      fetchImpl,
      maxAttempts: 1,
    });
    await expect(provider.generate("private prompt", "private system")).resolves.toBe(
      "generated result",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/ai/providers/azure.ts"),
      "utf8",
    );
    expect(source).not.toContain("createAdminClient");
    expect(source).not.toContain("createClient(");
    expect(source).not.toContain("recordOpsEvent");
  });

  it.each([
    [401, "azure_unauthorized"],
    [403, "azure_forbidden"],
    [404, "azure_deployment_not_found"],
    [429, "azure_rate_limited"],
    [400, "azure_configuration_mismatch"],
    [503, "azure_service_unavailable"],
  ])("normalizes HTTP %s without exposing response bodies", async (status, code) => {
    const fetchImpl = vi.fn(async () => new Response(
      "secret provider body",
      { status },
    )) as typeof fetch;
    const provider = new AzureProvider(azureEnvironment(), {
      fetchImpl,
      maxAttempts: 1,
    });
    const error = await provider.generate("prompt").catch((caught) => caught);
    expect(error).toBeInstanceOf(AzureProviderError);
    expect(error).toMatchObject({ code });
    expect(String(error)).not.toContain("secret provider body");
  });

  it("retries transient responses but not authentication failures", async () => {
    const transient = vi.fn()
      .mockResolvedValueOnce(new Response("temporary", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ output_text: "OK" }), { status: 200 })) as typeof fetch;
    await expect(new AzureProvider(azureEnvironment(), {
      fetchImpl: transient,
      maxAttempts: 2,
      sleep: async () => undefined,
    }).generate("prompt")).resolves.toBe("OK");
    expect(transient).toHaveBeenCalledTimes(2);

    const unauthorized = vi.fn(async () => new Response("no", { status: 401 })) as typeof fetch;
    await expect(new AzureProvider(azureEnvironment(), {
      fetchImpl: unauthorized,
      maxAttempts: 2,
      sleep: async () => undefined,
    }).generate("prompt")).rejects.toMatchObject({ code: "azure_unauthorized" });
    expect(unauthorized).toHaveBeenCalledTimes(1);
  });

  it("reports bounded timeout and malformed responses safely", async () => {
    const hanging = vi.fn((_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      })) as typeof fetch;
    await expect(new AzureProvider(azureEnvironment(), {
      fetchImpl: hanging,
      timeoutMs: 10,
      maxAttempts: 1,
    }).generate("prompt")).rejects.toMatchObject({ code: "azure_timeout" });

    const malformed = vi.fn(async () => new Response(JSON.stringify({
      output: [],
      hidden: "secret response text",
    }), { status: 200 })) as typeof fetch;
    const error = await new AzureProvider(azureEnvironment(), {
      fetchImpl: malformed,
      maxAttempts: 1,
    }).generate("prompt").catch((caught) => caught);
    expect(error).toMatchObject({ code: "azure_response_malformed" });
    expect(JSON.stringify(error)).not.toContain("secret response text");
  });
});
