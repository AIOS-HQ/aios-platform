import "server-only";

import {
  PROVIDER_DEFAULT_MODELS,
  createRuntimeIdentity,
  type RuntimeConfigurationStatus,
  type RuntimeIdentity,
  type RuntimeIdentityFields,
  type RuntimeType,
} from "@/lib/runtime-identity/model";

export type RuntimeEnvironment = Record<string, string | undefined>;

const PROVIDER_NAMES = new Map<string, string>([
  ["openai", "openai"],
  ["anthropic", "anthropic"],
  ["mock", "mock"],
  ["azure_openai", "azure_openai"],
  ["azure-openai", "azure_openai"],
  ["azure_foundry", "azure_foundry"],
  ["azure-foundry", "azure_foundry"],
  ["foundry", "azure_foundry"],
]);

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function safeIdentifier(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized && SAFE_IDENTIFIER.test(normalized) ? normalized : null;
}

export function safeEndpointHostname(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const endpoint = new URL(value);
    if (endpoint.protocol !== "https:" || !endpoint.hostname) return null;
    return endpoint.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function baseFields(overrides: Partial<RuntimeIdentityFields>): RuntimeIdentityFields {
  return {
    runtimeId: "aios.runtime.unavailable",
    runtimeType: "unavailable",
    provider: null,
    model: null,
    deploymentName: null,
    modelVersion: null,
    endpointHostname: null,
    sharedOrDedicated: "unavailable",
    configurationStatus: "unavailable",
    inferenceStatus: "unavailable",
    latencyBucket: null,
    safeErrorCode: null,
    safeMessage: "provider_configuration_unavailable",
    ...overrides,
  };
}

function configurationStatus(input: {
  credentialPresent: boolean;
  modelExplicit: boolean;
  modelValid: boolean;
}): RuntimeConfigurationStatus {
  if (!input.modelValid) return "misconfigured";
  return input.credentialPresent && input.modelExplicit ? "complete" : "incomplete";
}

function sharedProviderIdentity(input: {
  environment: RuntimeEnvironment;
  provider: "openai" | "anthropic";
  observedAt?: string | Date;
}): RuntimeIdentity {
  const modelValue = input.environment.AI_MODEL;
  const modelExplicit = Boolean(modelValue?.trim());
  const explicitModel = safeIdentifier(modelValue);
  const modelValid = !modelExplicit || explicitModel !== null;
  const model = explicitModel ?? PROVIDER_DEFAULT_MODELS[input.provider];
  const credentialPresent = input.provider === "openai"
    ? Boolean(input.environment.OPENAI_API_KEY)
    : Boolean(input.environment.ANTHROPIC_API_KEY);
  const configStatus = configurationStatus({ credentialPresent, modelExplicit, modelValid });
  const endpointHostname = input.provider === "openai"
    ? "api.openai.com"
    : "api.anthropic.com";

  return createRuntimeIdentity({
    fields: baseFields({
      runtimeId: `aios.runtime.shared.${input.provider}`,
      runtimeType: input.provider === "openai" ? "openai" : "shared_provider",
      provider: input.provider,
      model: modelValid ? model : null,
      endpointHostname,
      sharedOrDedicated: "shared",
      configurationStatus: configStatus,
      inferenceStatus: "not_probed",
      safeMessage:
        configStatus === "complete"
          ? "provider_configured_inference_not_probed"
          : configStatus === "misconfigured"
            ? "provider_model_identifier_invalid"
            : "provider_configuration_incomplete",
    }),
    status: configStatus === "misconfigured" ? "degraded" : configStatus === "complete" ? "degraded" : "unavailable",
    evidenceType: "configuration_proof",
    observedAt: input.observedAt,
    observedBy: "runtime_identity.configuration_resolver",
    confidence: 1,
    details: {
      scope: "provider_runtime_identity",
      providerExplicit: true,
      modelSource: modelExplicit ? "explicit" : "source_fallback",
      authenticationConfigured: credentialPresent,
      endpointConfigured: true,
      inferenceAttempted: false,
    },
  });
}

function azureIdentity(input: {
  environment: RuntimeEnvironment;
  provider: "azure_openai" | "azure_foundry";
  observedAt?: string | Date;
}): RuntimeIdentity {
  const isFoundry = input.provider === "azure_foundry";
  const endpointValue = isFoundry
    ? input.environment.AZURE_AI_FOUNDRY_ENDPOINT
    : input.environment.AZURE_OPENAI_ENDPOINT;
  const deploymentValue = isFoundry
    ? input.environment.AZURE_AI_FOUNDRY_DEPLOYMENT
    : input.environment.AZURE_OPENAI_DEPLOYMENT;
  const versionValue = isFoundry
    ? input.environment.AZURE_AI_FOUNDRY_MODEL_VERSION
    : input.environment.AZURE_OPENAI_MODEL_VERSION;
  const keyPresent = isFoundry
    ? Boolean(input.environment.AZURE_AI_FOUNDRY_API_KEY)
    : Boolean(input.environment.AZURE_OPENAI_API_KEY);
  const endpointHostname = safeEndpointHostname(endpointValue);
  const deploymentName = safeIdentifier(deploymentValue);
  const model = safeIdentifier(input.environment.AI_MODEL);
  const modelVersion = safeIdentifier(versionValue);
  const complete = Boolean(endpointHostname && deploymentName && keyPresent);
  const malformed = Boolean(endpointValue && !endpointHostname) || Boolean(deploymentValue && !deploymentName);

  return createRuntimeIdentity({
    fields: baseFields({
      runtimeId: `aios.runtime.${input.provider}.unverified`,
      runtimeType: input.provider as RuntimeType,
      provider: input.provider,
      model,
      deploymentName,
      modelVersion,
      endpointHostname,
      sharedOrDedicated: "unavailable",
      configurationStatus: malformed ? "misconfigured" : complete ? "unsupported" : "incomplete",
      inferenceStatus: "unavailable",
      safeMessage: malformed
        ? "azure_provider_configuration_malformed"
        : complete
          ? "azure_provider_adapter_not_implemented"
          : "azure_provider_configuration_incomplete",
    }),
    status: complete || malformed ? "degraded" : "unavailable",
    evidenceType: "configuration_proof",
    observedAt: input.observedAt,
    observedBy: "runtime_identity.configuration_resolver",
    confidence: 1,
    details: {
      scope: "provider_runtime_identity",
      providerExplicit: true,
      modelSource: deploymentName ? "deployment" : model ? "explicit" : "none",
      authenticationConfigured: keyPresent,
      endpointConfigured: Boolean(endpointHostname),
      inferenceAttempted: false,
    },
  });
}

export function resolveRuntimeIdentity(
  environment: RuntimeEnvironment = process.env,
  observedAt?: string | Date,
): RuntimeIdentity {
  const rawProvider = environment.AI_PROVIDER?.trim().toLowerCase();
  if (!rawProvider) {
    return createRuntimeIdentity({
      fields: baseFields({
        safeMessage: "ai_provider_not_explicitly_configured",
      }),
      status: "unavailable",
      evidenceType: "configuration_proof",
      observedAt,
      observedBy: "runtime_identity.configuration_resolver",
      confidence: 1,
      details: {
        scope: "provider_runtime_identity",
        providerExplicit: false,
        modelSource: "none",
        authenticationConfigured: false,
        endpointConfigured: false,
        inferenceAttempted: false,
      },
    });
  }

  const provider = PROVIDER_NAMES.get(rawProvider);
  if (!provider) {
    return createRuntimeIdentity({
      fields: baseFields({
        runtimeId: "aios.runtime.unsupported",
        runtimeType: "unsupported",
        provider: "unknown",
        configurationStatus: "unsupported",
        safeMessage: "ai_provider_not_supported",
      }),
      status: "degraded",
      evidenceType: "configuration_proof",
      observedAt,
      observedBy: "runtime_identity.configuration_resolver",
      confidence: 1,
      details: {
        scope: "provider_runtime_identity",
        providerExplicit: true,
        modelSource: "none",
        authenticationConfigured: false,
        endpointConfigured: false,
        inferenceAttempted: false,
      },
    });
  }

  if (provider === "mock") {
    return createRuntimeIdentity({
      fields: baseFields({
        runtimeId: "aios.runtime.deterministic.mock",
        runtimeType: "deterministic",
        provider: "mock",
        sharedOrDedicated: "deterministic",
        configurationStatus: "complete",
        inferenceStatus: "not_applicable",
        safeMessage: "deterministic_mock_runtime_configured",
      }),
      status: "healthy",
      evidenceType: "configuration_proof",
      observedAt,
      observedBy: "runtime_identity.configuration_resolver",
      confidence: 1,
      details: {
        scope: "provider_runtime_identity",
        providerExplicit: true,
        modelSource: "none",
        authenticationConfigured: false,
        endpointConfigured: false,
        inferenceAttempted: false,
      },
    });
  }

  if (provider === "openai" || provider === "anthropic") {
    return sharedProviderIdentity({ environment, provider, observedAt });
  }

  return azureIdentity({
    environment,
    provider: provider as "azure_openai" | "azure_foundry",
    observedAt,
  });
}
