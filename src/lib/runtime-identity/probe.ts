import "server-only";

import {
  createAzureResponsesRequest,
  extractAzureResponseText,
  resolveAzureProviderConfig,
} from "@/lib/ai/providers/azure";

import {
  createRuntimeIdentity,
  runtimeIdentityFields,
  type RuntimeIdentity,
  type RuntimeInferenceStatus,
  type RuntimeLatencyBucket,
} from "@/lib/runtime-identity/model";
import type { EvidenceStatus } from "@/lib/evidence/model";
import {
  resolveRuntimeIdentity,
  type RuntimeEnvironment,
} from "@/lib/runtime-identity/resolver";

type ProbeFetch = typeof fetch;

export interface RuntimeProbeOptions {
  environment?: RuntimeEnvironment;
  fetchImpl?: ProbeFetch;
  timeoutMs?: number;
  maxAttempts?: number;
  observedAt?: string | Date;
  clock?: () => number;
}

const FIXED_HEALTH_REQUEST = "Respond with the single word OK.";
const FIXED_HEALTH_SYSTEM = "AIOS provider health probe. Do not include any additional text.";

function latencyBucket(durationMs: number): RuntimeLatencyBucket {
  if (durationMs < 1_000) return "under_1s";
  if (durationMs < 3_000) return "1s_to_3s";
  if (durationMs < 10_000) return "3s_to_10s";
  return "over_10s";
}

function safeErrorCode(status: number): string {
  if (status === 401) return "provider_unauthorized";
  if (status === 403) return "provider_forbidden";
  if (status === 404) return "provider_deployment_not_found";
  if (status === 429) return "provider_rate_limited";
  if (status === 400 || status === 409 || status === 422) {
    return "provider_configuration_mismatch";
  }
  if (status >= 500) return "provider_unavailable";
  return "provider_request_rejected";
}

function probeRequest(identity: RuntimeIdentity, environment: RuntimeEnvironment): {
  url: string;
  init: RequestInit;
} | null {
  if (!identity.model) return null;
  if (identity.provider === "openai" && environment.OPENAI_API_KEY) {
    return {
      url: "https://api.openai.com/v1/chat/completions",
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${environment.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: identity.model,
          temperature: 0,
          max_tokens: 2,
          messages: [
            { role: "system", content: FIXED_HEALTH_SYSTEM },
            { role: "user", content: FIXED_HEALTH_REQUEST },
          ],
        }),
      },
    };
  }
  if (identity.provider === "anthropic" && environment.ANTHROPIC_API_KEY) {
    return {
      url: "https://api.anthropic.com/v1/messages",
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": environment.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: identity.model,
          max_tokens: 2,
          system: FIXED_HEALTH_SYSTEM,
          messages: [{ role: "user", content: FIXED_HEALTH_REQUEST }],
        }),
      },
    };
  }
  if (identity.provider === "azure") {
    const resolved = resolveAzureProviderConfig(environment);
    if (!resolved.ok) return null;
    return createAzureResponsesRequest({
      config: resolved.config,
      prompt: FIXED_HEALTH_REQUEST,
      system: FIXED_HEALTH_SYSTEM,
      maxPromptChars: 256,
      maxOutputTokens: 16,
    });
  }
  return null;
}

function responseHasText(provider: string | null, payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  if (provider === "openai") {
    const choices = (payload as { choices?: unknown }).choices;
    if (!Array.isArray(choices)) return false;
    const content = (choices[0] as { message?: { content?: unknown } } | undefined)?.message?.content;
    return typeof content === "string" && content.trim().length > 0;
  }
  if (provider === "anthropic") {
    const content = (payload as { content?: unknown }).content;
    if (!Array.isArray(content)) return false;
    const text = (content[0] as { text?: unknown } | undefined)?.text;
    return typeof text === "string" && text.trim().length > 0;
  }
  if (provider === "azure") return Boolean(extractAzureResponseText(payload));
  return false;
}

function probeResult(input: {
  configured: RuntimeIdentity;
  inferenceStatus: RuntimeInferenceStatus;
  status: EvidenceStatus;
  safeMessage: string;
  safeErrorCode: string | null;
  latency: RuntimeLatencyBucket;
  observedAt?: string | Date;
  inferenceAttempted: boolean;
  configurationStatus?: RuntimeIdentity["configurationStatus"];
}): RuntimeIdentity {
  return createRuntimeIdentity({
    fields: {
      ...runtimeIdentityFields(input.configured),
      inferenceStatus: input.inferenceStatus,
      latencyBucket: input.latency,
      safeErrorCode: input.safeErrorCode,
      safeMessage: input.safeMessage,
      ...(input.configurationStatus
        ? { configurationStatus: input.configurationStatus }
        : {}),
    },
    status: input.status,
    evidenceType: input.inferenceAttempted
      ? "authenticated_runtime_proof"
      : input.configured.evidenceType,
    observedAt: input.observedAt,
    observedBy: "runtime_identity.inference_probe",
    confidence: input.inferenceAttempted ? 0.95 : input.configured.confidence,
    details: {
      ...input.configured.details,
      inferenceAttempted: input.inferenceAttempted,
    },
  });
}

export async function probeRuntimeIdentity(
  options: RuntimeProbeOptions = {},
): Promise<RuntimeIdentity> {
  const environment = options.environment ?? process.env;
  const observedAt = options.observedAt ?? new Date();
  const configured = resolveRuntimeIdentity(environment, observedAt);
  const request = probeRequest(configured, environment);
  if (!request) {
    return probeResult({
      configured,
      inferenceStatus: configured.runtimeType === "deterministic" ? "not_applicable" : "unavailable",
      status: configured.runtimeType === "deterministic" ? configured.status : "unavailable",
      safeMessage: configured.safeMessage,
      safeErrorCode: null,
      latency: null,
      observedAt,
      inferenceAttempted: false,
    });
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = Math.min(15_000, Math.max(250, options.timeoutMs ?? 5_000));
  const maxAttempts = Math.min(2, Math.max(1, options.maxAttempts ?? 2));
  const clock = options.clock ?? (() => performance.now());
  const startedAt = clock();
  let lastCode = "provider_request_failed";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(request.url, {
        ...request.init,
        signal: controller.signal,
      });
      if (!response.ok) {
        lastCode = safeErrorCode(response.status);
        if ((response.status === 429 || response.status >= 500) && attempt < maxAttempts) continue;
        const configurationStatus = [
          "provider_unauthorized",
          "provider_forbidden",
          "provider_deployment_not_found",
          "provider_configuration_mismatch",
        ].includes(lastCode)
          ? "misconfigured" as const
          : configured.configurationStatus;
        return probeResult({
          configured,
          inferenceStatus: "failed",
          status: "degraded",
          safeMessage: "provider_inference_probe_failed",
          safeErrorCode: lastCode,
          latency: latencyBucket(clock() - startedAt),
          observedAt,
          inferenceAttempted: true,
          configurationStatus,
        });
      }

      const payload: unknown = await response.json().catch(() => null);
      if (!responseHasText(configured.provider, payload)) {
        return probeResult({
          configured,
          inferenceStatus: "failed",
          status: "degraded",
          safeMessage: "provider_inference_response_malformed",
          safeErrorCode: "malformed_provider_response",
          latency: latencyBucket(clock() - startedAt),
          observedAt,
          inferenceAttempted: true,
        });
      }

      return probeResult({
        configured,
        inferenceStatus: "healthy",
        status: "healthy",
        safeMessage: "provider_inference_probe_succeeded",
        safeErrorCode: null,
        latency: latencyBucket(clock() - startedAt),
        observedAt,
        inferenceAttempted: true,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return probeResult({
          configured,
          inferenceStatus: "timeout",
          status: "degraded",
          safeMessage: "provider_inference_probe_timed_out",
          safeErrorCode: "provider_timeout",
          latency: latencyBucket(clock() - startedAt),
          observedAt,
          inferenceAttempted: true,
        });
      }
      lastCode = "provider_network_error";
      if (attempt < maxAttempts) continue;
    } finally {
      clearTimeout(timer);
    }
  }

  return probeResult({
    configured,
    inferenceStatus: "failed",
    status: "degraded",
    safeMessage: "provider_inference_probe_failed",
    safeErrorCode: lastCode,
    latency: latencyBucket(clock() - startedAt),
    observedAt,
    inferenceAttempted: true,
  });
}
