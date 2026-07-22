import "server-only";

import type { AIProvider } from "../types";
import { aiLimits, backoffDelayMs, clampPrompt, shouldRetry } from "../limits";
import { recordProviderCall } from "../health";

export type AzureProviderEnvironment = Record<string, string | undefined>;

export type AzureProviderErrorCode =
  | "azure_configuration_missing_endpoint"
  | "azure_configuration_invalid_endpoint"
  | "azure_configuration_missing_api_key"
  | "azure_configuration_missing_deployment"
  | "azure_configuration_invalid_deployment"
  | "azure_unauthorized"
  | "azure_forbidden"
  | "azure_deployment_not_found"
  | "azure_rate_limited"
  | "azure_timeout"
  | "azure_response_malformed"
  | "azure_service_unavailable"
  | "azure_configuration_mismatch"
  | "azure_request_rejected"
  | "azure_network_error";

export class AzureProviderError extends Error {
  readonly code: AzureProviderErrorCode;
  readonly status: number | null;

  constructor(code: AzureProviderErrorCode, status: number | null = null) {
    super(code);
    this.name = "AzureProviderError";
    this.code = code;
    this.status = status;
  }
}

export interface AzureProviderConfigState {
  endpointHostname: string | null;
  deploymentName: string | null;
  authenticationConfigured: boolean;
  endpointConfigured: boolean;
}

export type AzureProviderConfig = AzureProviderConfigState & {
  apiKey: string;
  responsesUrl: string;
};

export type AzureProviderConfigResult =
  | { ok: true; config: AzureProviderConfig }
  | {
      ok: false;
      code: Extract<
        AzureProviderErrorCode,
        | "azure_configuration_missing_endpoint"
        | "azure_configuration_invalid_endpoint"
        | "azure_configuration_missing_api_key"
        | "azure_configuration_missing_deployment"
        | "azure_configuration_invalid_deployment"
      >;
      state: AzureProviderConfigState;
    };

const SAFE_DEPLOYMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const AZURE_OPENAI_HOST_SUFFIXES = [
  ".openai.azure.com",
  ".services.ai.azure.com",
  ".cognitiveservices.azure.com",
] as const;

function parseAzureEndpoint(value: string | undefined): {
  hostname: string;
  responsesUrl: string;
} | null {
  if (!value?.trim()) return null;
  try {
    const endpoint = new URL(value.trim());
    const hostname = endpoint.hostname.toLowerCase();
    if (
      endpoint.protocol !== "https:" ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash ||
      !AZURE_OPENAI_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
    ) {
      return null;
    }

    const path = endpoint.pathname.replace(/\/+$/, "");
    if (path && path !== "/openai/v1") return null;
    return {
      hostname,
      responsesUrl: `${endpoint.origin}/openai/v1/responses`,
    };
  } catch {
    return null;
  }
}

export function resolveAzureProviderConfig(
  environment: AzureProviderEnvironment = process.env,
): AzureProviderConfigResult {
  const endpointValue = environment.AZURE_OPENAI_ENDPOINT;
  const parsedEndpoint = parseAzureEndpoint(endpointValue);
  const deploymentValue = environment.AI_MODEL?.trim();
  const deploymentName = deploymentValue && SAFE_DEPLOYMENT.test(deploymentValue)
    ? deploymentValue
    : null;
  const apiKey = environment.AZURE_OPENAI_API_KEY ?? "";
  const state: AzureProviderConfigState = {
    endpointHostname: parsedEndpoint?.hostname ?? null,
    deploymentName,
    authenticationConfigured: Boolean(apiKey),
    endpointConfigured: Boolean(parsedEndpoint),
  };

  if (!endpointValue?.trim()) {
    return { ok: false, code: "azure_configuration_missing_endpoint", state };
  }
  if (!parsedEndpoint) {
    return { ok: false, code: "azure_configuration_invalid_endpoint", state };
  }
  if (!deploymentValue) {
    return { ok: false, code: "azure_configuration_missing_deployment", state };
  }
  if (!deploymentName) {
    return { ok: false, code: "azure_configuration_invalid_deployment", state };
  }
  if (!apiKey) {
    return { ok: false, code: "azure_configuration_missing_api_key", state };
  }

  return {
    ok: true,
    config: {
      ...state,
      endpointHostname: parsedEndpoint.hostname,
      deploymentName,
      apiKey,
      responsesUrl: parsedEndpoint.responsesUrl,
    },
  };
}

export function createAzureResponsesRequest(input: {
  config: AzureProviderConfig;
  prompt: string;
  system?: string;
  maxPromptChars: number;
  maxOutputTokens: number;
}): { url: string; init: RequestInit } {
  return {
    url: input.config.responsesUrl,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": input.config.apiKey,
      },
      body: JSON.stringify({
        model: input.config.deploymentName,
        ...(input.system
          ? { instructions: clampPrompt(input.system, input.maxPromptChars) }
          : {}),
        input: clampPrompt(input.prompt, input.maxPromptChars),
        max_output_tokens: input.maxOutputTokens,
      }),
    },
  };
}

export function extractAzureResponseText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const direct = (payload as { output_text?: unknown }).output_text;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) return null;
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      const text = part && typeof part === "object"
        ? (part as { text?: unknown }).text
        : null;
      if (typeof text === "string" && text.trim()) return text.trim();
    }
  }
  return null;
}

export function azureErrorCodeForStatus(status: number): AzureProviderErrorCode {
  if (status === 401) return "azure_unauthorized";
  if (status === 403) return "azure_forbidden";
  if (status === 404) return "azure_deployment_not_found";
  if (status === 429) return "azure_rate_limited";
  if (status === 400 || status === 409 || status === 422) {
    return "azure_configuration_mismatch";
  }
  if (status >= 500) return "azure_service_unavailable";
  return "azure_request_rejected";
}

interface ExecuteAzureOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxAttempts?: number;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
}

async function executeAzureResponses(
  request: { url: string; init: RequestInit },
  options: ExecuteAzureOptions = {},
): Promise<string> {
  const limits = aiLimits();
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = Math.min(120_000, Math.max(1, options.timeoutMs ?? limits.timeoutMs));
  const maxAttempts = Math.min(6, Math.max(1, options.maxAttempts ?? limits.maxRetries + 1));
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, timeoutMs);
    try {
      const response = await fetchImpl(request.url, {
        ...request.init,
        signal: controller.signal,
      });
      if (!response.ok) {
        const code = azureErrorCodeForStatus(response.status);
        if (shouldRetry(response.status) && attempt + 1 < maxAttempts) {
          await sleep(backoffDelayMs(attempt));
          continue;
        }
        throw new AzureProviderError(code, response.status);
      }

      const payload: unknown = await response.json().catch(() => null);
      const text = extractAzureResponseText(payload);
      if (!text) throw new AzureProviderError("azure_response_malformed", response.status);
      return text;
    } catch (error) {
      if (error instanceof AzureProviderError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new AzureProviderError("azure_timeout");
      }
      if (attempt + 1 >= maxAttempts) {
        throw new AzureProviderError("azure_network_error");
      }
      await sleep(backoffDelayMs(attempt));
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    }
  }
  throw new AzureProviderError("azure_network_error");
}

/** Azure OpenAI Responses API adapter for the shared AIOS provider runtime. */
export class AzureProvider implements AIProvider {
  readonly name = "azure";

  constructor(
    private readonly environment: AzureProviderEnvironment = process.env,
    private readonly executeOptions: ExecuteAzureOptions = {},
  ) {}

  async generate(
    prompt: string,
    system?: string,
    options?: { signal?: AbortSignal },
  ): Promise<string> {
    const started = Date.now();
    const resolved = resolveAzureProviderConfig(this.environment);
    if (!resolved.ok) {
      const error = new AzureProviderError(resolved.code);
      recordProviderCall({
        provider: this.name,
        ok: false,
        latencyMs: Date.now() - started,
        error: error.code,
      });
      throw error;
    }

    const { maxPromptChars, maxOutputTokens } = aiLimits();
    const request = createAzureResponsesRequest({
      config: resolved.config,
      prompt,
      system,
      maxPromptChars,
      maxOutputTokens,
    });
    try {
      const text = await executeAzureResponses(request, {
        ...this.executeOptions,
        signal: options?.signal ?? this.executeOptions.signal,
      });
      recordProviderCall({
        provider: this.name,
        ok: true,
        latencyMs: Date.now() - started,
      });
      return text;
    } catch (error) {
      const safeError = error instanceof AzureProviderError
        ? error
        : new AzureProviderError("azure_network_error");
      recordProviderCall({
        provider: this.name,
        ok: false,
        latencyMs: Date.now() - started,
        error: safeError.code,
      });
      throw safeError;
    }
  }
}
