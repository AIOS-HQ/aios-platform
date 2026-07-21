import "server-only";

import type { EvidenceMetadata, EvidenceType } from "@/lib/evidence/model";
import {
  createCertificationEvidence,
  evidenceTypeFromVercelTier,
} from "@/lib/evidence/certification";
import { getProviderHealth } from "@/lib/integrations/connector-health";
import { getConnector } from "@/lib/integrations/connectors";
import { isConnectorConfigured } from "@/lib/integrations/connector-config";
import { getConnectorDefinition } from "@/lib/integrations/registry";
import { isDevConfigured } from "@/lib/integrations/registry-status";
import { assessIntegrationReadiness } from "@/lib/integrations/readiness";
import {
  AIOS_WORKFORCE,
  type AiosAgent,
  type AiosAgentKey,
  getAgentConnectors,
  isFounderOnlyAgent,
} from "@/lib/workforce/registry";

export type WorkforceCertificationStatus =
  | "production_ready"
  | "operational_with_approval"
  | "partial"
  | "advisory_only"
  | "configuration_required"
  | "blocked"
  | "metadata_only"
  | "unsupported";

export const WORKFORCE_STATUS_LABELS: Record<WorkforceCertificationStatus, string> = {
  production_ready: "Production ready",
  operational_with_approval: "Operational with approval",
  partial: "Partial",
  advisory_only: "Advisory only",
  configuration_required: "Configuration required",
  blocked: "Blocked",
  metadata_only: "Metadata only",
  unsupported: "Unsupported",
};

export interface WorkforceConnectorDependency {
  provider: string;
  purpose: string;
  capabilities: string[];
  required: boolean;
}

export interface WorkforceRuntimeContract {
  key: AiosAgentKey;
  availableSkills: string[];
  availableTools: string[];
  connectorDependencies: WorkforceConnectorDependency[];
  runtimeHandlers: string[];
  delegationCapability: "send_receive" | "receive_only" | "none";
  executionCapability: "real_runtime" | "guided_runtime" | "advisory" | "none";
  approvalPolicy: string;
  autonomyPolicy: string;
  unsupportedCapabilities: string[];
}

export interface WorkforceDependencyReadiness
  extends WorkforceConnectorDependency,
    EvidenceMetadata<{
      scope: "connector_dependency";
      provider: string;
      runtimeProbed: boolean;
    }> {
  exists: boolean;
  configured: boolean;
  connected: boolean;
  status: WorkforceCertificationStatus;
  blockers: string[];
  implementedCapabilities: string[];
  missingCapabilities: string[];
}

export interface WorkforceAgentCertification
  extends EvidenceMetadata<{
    scope: "workforce_runtime_contract";
    runtimeProbed: false;
    dependencyChecks: number;
  }> {
  agent: AiosAgent;
  founderOnly: boolean;
  juliusAccess: AiosAgent["julius"];
  contract: WorkforceRuntimeContract;
  status: WorkforceCertificationStatus;
  label: string;
  health: "healthy" | "degraded" | "blocked";
  blockers: string[];
  dependencyReadiness: WorkforceDependencyReadiness[];
}

const SOCIAL_CAPABILITY_IDS: Record<string, Set<string>> = {
  linkedin: new Set(["textPost", "documentCarousel"]),
  x: new Set(["textPost", "imagePost", "multiImagePost"]),
  youtube: new Set([
    "upload_video",
    "upload_short",
    "upload_thumbnail",
    "edit_metadata",
    "schedule_publish",
    "add_to_playlist",
  ]),
};

const VERCEL_READ_CAPABILITIES = new Set(["deployment_status", "build_status", "list_deployments"]);

export const WORKFORCE_RUNTIME_CONTRACTS: Record<AiosAgentKey, WorkforceRuntimeContract> = {
  harmony: {
    key: "harmony",
    availableSkills: ["Julius recall", "Company Skills consultation", "Organizational intelligence", "Adaptive planning"],
    availableTools: ["A2A delegation", "Work queue", "Approval routing", "Connector runtime"],
    connectorDependencies: [],
    runtimeHandlers: ["sendAgentMessage", "delegateTask", "respondToTask", "createWorkItem", "runConnectorCapability"],
    delegationCapability: "send_receive",
    executionCapability: "guided_runtime",
    approvalPolicy: "Routes approval/destructive work through Approval Center.",
    autonomyPolicy: "Coordinates under bounded autonomy; no destructive bypass.",
    unsupportedCapabilities: ["Direct destructive execution", "Ungoverned external publishing"],
  },
  auditor: {
    key: "auditor",
    availableSkills: ["Evidence classification", "Governance sweep", "Risk posture reporting"],
    availableTools: ["runAudit", "runGovernanceSweep", "Work queue remediation", "Julius write"],
    connectorDependencies: [],
    runtimeHandlers: ["runAudit", "recordAuditToJulius", "runGovernanceSweep"],
    delegationCapability: "send_receive",
    executionCapability: "real_runtime",
    approvalPolicy: "Remediation work is queued and high-risk findings remain approval-gated.",
    autonomyPolicy: "Read-only inspection can run; remediation is routed as work.",
    unsupportedCapabilities: ["Secret inspection by value", "Destructive remediation"],
  },
  mason: {
    key: "mason",
    availableSkills: ["Engineering planning", "Validation", "PR evidence reporting", "Reusable engineering skills"],
    availableTools: ["Mason production runtime", "GitHub connector", "Vercel preview inspection", "Julius", "Company Skills"],
    connectorDependencies: [
      { provider: "github", purpose: "Branch, commit, issue, and PR operations", capabilities: ["create_branch", "commit_file_to_branch", "open_pull_request", "create_issue"], required: true },
      { provider: "vercel", purpose: "Preview and deployment inspection", capabilities: ["deployment_status"], required: true },
    ],
    runtimeHandlers: ["runMasonProductionRuntime", "executeMasonRuntimePlan", "determineMasonExecutionReadiness"],
    delegationCapability: "send_receive",
    executionCapability: "real_runtime",
    approvalPolicy: "Founder-only; mutations require Founder-approved execution scope; merge/destructive actions blocked.",
    autonomyPolicy: "Default autonomy level 0; PR/preview bounded.",
    unsupportedCapabilities: ["Direct production editing", "Unapproved merge", "Repository deletion", "Secret mutation"],
  },
  catalyst: {
    key: "catalyst",
    availableSkills: ["Content planning", "Draft preparation", "Campaign coordination"],
    availableTools: ["Harmony Social", "Company Skills", "Julius"],
    connectorDependencies: [
      { provider: "linkedin", purpose: "Founder-approved LinkedIn publishing via Harmony Social", capabilities: ["textPost", "documentCarousel"], required: false },
      { provider: "x", purpose: "Founder-approved X text/image publishing via Harmony Social", capabilities: ["textPost", "imagePost", "multiImagePost"], required: false },
      { provider: "youtube", purpose: "Founder-approved YouTube publishing via Harmony Social", capabilities: ["upload_video", "schedule_publish"], required: false },
    ],
    runtimeHandlers: ["prepare social drafts through Harmony Social", "delegateTask", "respondToTask"],
    delegationCapability: "send_receive",
    executionCapability: "guided_runtime",
    approvalPolicy: "External publishing must pass Harmony Social approval, exact-content hash, and idempotency.",
    autonomyPolicy: "May plan/draft; external publishing approval-required.",
    unsupportedCapabilities: ["Ungoverned publishing", "Fabricated analytics", "Unimplemented provider media types"],
  },
  ambassador: {
    key: "ambassador",
    availableSkills: ["Message triage", "Risk classification", "Response drafting"],
    availableTools: ["Comms inbox", "Approval routing", "Native web chat"],
    connectorDependencies: [
      { provider: "gmail", purpose: "Email message read/draft workflows", capabilities: ["list_messages"], required: false },
      { provider: "slack", purpose: "Slack channel visibility", capabilities: ["list_channels"], required: false },
      { provider: "whatsapp", purpose: "WhatsApp Business messaging", capabilities: ["send_message"], required: false },
      { provider: "messenger", purpose: "Messenger conversations", capabilities: ["send_message"], required: false },
      { provider: "instagram", purpose: "Instagram messaging", capabilities: ["send_message"], required: false },
    ],
    runtimeHandlers: ["classifyCommunicationRisk", "Comms approval gate", "delegateTask", "respondToTask"],
    delegationCapability: "send_receive",
    executionCapability: "guided_runtime",
    approvalPolicy: "High-risk topics always require owner approval.",
    autonomyPolicy: "Low-risk native responses only when channel and policy permit.",
    unsupportedCapabilities: ["Framework-only Meta channel execution", "Financial/legal/medical replies without approval"],
  },
  atlas: {
    key: "atlas",
    availableSkills: ["Knowledge curation", "Decision history", "Skill promotion"],
    availableTools: ["Julius recall/write", "Company Skills"],
    connectorDependencies: [],
    runtimeHandlers: ["juliusRecall", "juliusRemember", "learnCompanySkill", "listCompanySkills"],
    delegationCapability: "send_receive",
    executionCapability: "real_runtime",
    approvalPolicy: "Curates knowledge; high-risk records remain reviewable.",
    autonomyPolicy: "Stewardship writes are internal and auditable.",
    unsupportedCapabilities: ["Cross-company memory access", "Replacing Julius as an agent"],
  },
  pulse: {
    key: "pulse",
    availableSkills: ["Operational monitoring", "Health summarization", "Alert routing"],
    availableTools: ["Integration health", "Activity feed", "Audit reports"],
    connectorDependencies: [
      { provider: "vercel", purpose: "Deployment status when token is configured", capabilities: ["deployment_status"], required: false },
      { provider: "supabase", purpose: "Database diagnostics when configured", capabilities: ["db_health_check"], required: false },
    ],
    runtimeHandlers: ["getProviderHealth", "runVercelDiagnostics", "runAudit"],
    delegationCapability: "send_receive",
    executionCapability: "advisory",
    approvalPolicy: "Alerts route to Harmony, Auditor, Aegis, Mason, or Founder.",
    autonomyPolicy: "Monitoring is read-only; remediation delegated.",
    unsupportedCapabilities: ["Fabricated real-time monitoring", "Unconfigured provider polling"],
  },
  horizon: {
    key: "horizon",
    availableSkills: ["Roadmaps", "Scenario analysis", "Goal tracking"],
    availableTools: ["Organizational intelligence", "Adaptive planning", "Work queue"],
    connectorDependencies: [],
    runtimeHandlers: ["buildOrganizationalIntelligence", "buildAdaptiveExecutionPlan", "createWorkItem"],
    delegationCapability: "send_receive",
    executionCapability: "advisory",
    approvalPolicy: "Creates plans and delegated work; does not execute external actions.",
    autonomyPolicy: "Planning/recommendations are advisory by default.",
    unsupportedCapabilities: ["External execution", "Ungrounded strategy claims"],
  },
  aegis: {
    key: "aegis",
    availableSkills: ["Risk classification", "Credential safety", "Approval escalation"],
    availableTools: ["Secret redaction", "Integration readiness", "Autonomy audit"],
    connectorDependencies: [],
    runtimeHandlers: ["redactSecret", "getProviderHealth", "evaluateAutonomyPolicy", "runAudit"],
    delegationCapability: "send_receive",
    executionCapability: "advisory",
    approvalPolicy: "Security/high-risk actions always escalate.",
    autonomyPolicy: "Detection and recommendations only unless explicitly approved.",
    unsupportedCapabilities: ["Active threat detection beyond available telemetry", "Secret value display"],
  },
  ledger: {
    key: "ledger",
    availableSkills: ["Approval records", "Audit trails", "Compliance history"],
    availableTools: ["Approvals", "Activity feed", "Execution results", "Julius"],
    connectorDependencies: [],
    runtimeHandlers: ["listApprovals", "listAutonomyAudit", "emitActivity", "juliusRemember"],
    delegationCapability: "send_receive",
    executionCapability: "real_runtime",
    approvalPolicy: "Records governed outcomes; does not execute payments.",
    autonomyPolicy: "Internal recordkeeping only.",
    unsupportedCapabilities: ["Finance/payment execution", "Mutable evidence claims"],
  },
};

function providerConfigured(provider: string): boolean {
  const def = getConnectorDefinition(provider);
  if (def) return isDevConfigured(def);
  const legacy = getConnector(provider);
  if (legacy) return isConnectorConfigured(legacy);
  return false;
}

function socialProviderBlockers(provider: string, capabilities: string[]): string[] {
  if (provider === "linkedin" && capabilities.some((capability) => SOCIAL_CAPABILITY_IDS.linkedin.has(capability))) {
    return [
      ...(!process.env.LINKEDIN_PUBLISHER_ACCESS_TOKEN ? ["LinkedIn publisher token is not configured."] : []),
      ...(!process.env.LINKEDIN_ORGANIZATION_URN && !process.env.LINKEDIN_ORGANIZATION_ID
        ? ["LinkedIn organization is not configured."]
        : []),
    ];
  }
  return [];
}

function socialCapabilityImplemented(provider: string, capability: string): boolean {
  return SOCIAL_CAPABILITY_IDS[provider]?.has(capability) ?? false;
}

function vercelCapabilityImplemented(capability: string): boolean {
  return VERCEL_READ_CAPABILITIES.has(capability);
}

function dependencyEvidenceType(
  health: Awaited<ReturnType<typeof getProviderHealth>> | null,
): EvidenceType {
  if (health?.deploymentStatus) {
    return evidenceTypeFromVercelTier(health.deploymentStatus.evidenceTier);
  }
  return health ? "authenticated_runtime_proof" : "configuration_proof";
}

async function evaluateDependency(
  userId: string | null,
  dependency: WorkforceConnectorDependency,
): Promise<WorkforceDependencyReadiness> {
  const def = getConnectorDefinition(dependency.provider);
  const configured = providerConfigured(dependency.provider);
  if (!def) {
    const evidence = createCertificationEvidence({
      status: "unsupported" as const,
      evidenceType: "source_code_proof",
      observedBy: "workforce.certification.dependency",
      confidence: 1,
      details: {
        scope: "connector_dependency" as const,
        provider: dependency.provider,
        runtimeProbed: false,
      },
    });
    return {
      ...dependency,
      ...evidence,
      exists: false,
      configured: false,
      connected: false,
      blockers: ["Connector is not registered."],
      implementedCapabilities: [],
      missingCapabilities: dependency.capabilities,
    };
  }

  const health = userId ? await getProviderHealth(userId, dependency.provider) : null;
  const readiness = health ? assessIntegrationReadiness(def, health) : null;
  const runtimeImplemented = new Set(
    health?.capabilityDetails.filter((cap) => cap.implemented).map((cap) => cap.id) ?? [],
  );
  const implementedCapabilities = dependency.capabilities.filter(
    (capability) =>
      runtimeImplemented.has(capability) ||
      socialCapabilityImplemented(dependency.provider, capability) ||
      (dependency.provider === "vercel" && vercelCapabilityImplemented(capability)),
  );
  const missingCapabilities = dependency.capabilities.filter((capability) => !implementedCapabilities.includes(capability));
  const blockers = [
    ...(readiness?.founderActions ?? []),
    ...socialProviderBlockers(dependency.provider, dependency.capabilities),
    ...(missingCapabilities.length > 0 ? [`Missing runtime capability: ${missingCapabilities.join(", ")}.`] : []),
    ...(!configured ? [`${dependency.provider} configuration is not complete.`] : []),
  ];

  let status: WorkforceCertificationStatus;
  if (missingCapabilities.length === dependency.capabilities.length) status = "metadata_only";
  else if (blockers.length > 0 && dependency.required) status = "configuration_required";
  else if (blockers.length > 0) status = "partial";
  else status = dependency.required ? "production_ready" : "operational_with_approval";

  const evidenceType = dependencyEvidenceType(health);
  const evidence = createCertificationEvidence({
    status,
    evidenceType,
    observedBy: "workforce.certification.dependency",
    confidence:
      evidenceType === "live_runtime_proof"
        ? 1
        : evidenceType === "authenticated_runtime_proof"
          ? 0.85
          : evidenceType === "configuration_proof"
            ? 0.75
            : 0,
    details: {
      scope: "connector_dependency" as const,
      provider: dependency.provider,
      runtimeProbed: Boolean(health),
    },
  });
  return {
    ...dependency,
    ...evidence,
    exists: true,
    configured: health?.configured ?? configured,
    connected: health?.connected ?? false,
    blockers,
    implementedCapabilities,
    missingCapabilities,
  };
}

function baseStatusFor(agent: AiosAgent, deps: WorkforceDependencyReadiness[]): WorkforceCertificationStatus {
  const contract = WORKFORCE_RUNTIME_CONTRACTS[agent.key];
  const required = deps.filter((dep) => dep.required);
  if (required.some((dep) => dep.status === "unsupported" || dep.status === "metadata_only")) return "blocked";
  if (required.some((dep) => dep.blockers.length > 0)) return "configuration_required";
  if (contract.executionCapability === "real_runtime") {
    return isFounderOnlyAgent(agent.key) ? "operational_with_approval" : "production_ready";
  }
  if (contract.executionCapability === "guided_runtime") return "operational_with_approval";
  if (contract.executionCapability === "advisory") return "advisory_only";
  return "metadata_only";
}

export async function certifyWorkforceAgent(
  agent: AiosAgent,
  opts: { userId?: string | null } = {},
): Promise<WorkforceAgentCertification> {
  const contract = WORKFORCE_RUNTIME_CONTRACTS[agent.key];
  const dependencyReadiness = await Promise.all(
    contract.connectorDependencies.map((dependency) => evaluateDependency(opts.userId ?? null, dependency)),
  );
  const dependencyBlockers = dependencyReadiness.flatMap((dep) =>
    dep.blockers.map((blocker) => `${dep.provider}: ${blocker}`),
  );
  const status = baseStatusFor(agent, dependencyReadiness);
  const blockers = [
    ...dependencyBlockers,
    ...contract.unsupportedCapabilities.map((capability) => `Unsupported: ${capability}.`),
  ];

  const evidence = createCertificationEvidence({
    status,
    evidenceType: "source_code_proof",
    observedBy: "workforce.certification.runtime_contract",
    confidence: 1,
    details: {
      scope: "workforce_runtime_contract" as const,
      runtimeProbed: false as const,
      dependencyChecks: dependencyReadiness.length,
    },
  });

  return {
    agent,
    founderOnly: isFounderOnlyAgent(agent.key),
    juliusAccess: agent.julius,
    contract,
    ...evidence,
    label: WORKFORCE_STATUS_LABELS[status],
    // Runtime contracts and dependency metadata are not live agent health.
    health: status === "blocked" ? "blocked" : "degraded",
    blockers,
    dependencyReadiness,
  };
}

export async function certifyAiosWorkforce(opts: { userId?: string | null } = {}) {
  const entries = await Promise.all(AIOS_WORKFORCE.map((agent) => certifyWorkforceAgent(agent, opts)));
  return Object.fromEntries(entries.map((entry) => [entry.agent.key, entry])) as Record<AiosAgentKey, WorkforceAgentCertification>;
}

export function workforceConnectorIdsForAgent(agent: AiosAgentKey): string[] {
  return Array.from(new Set([...getAgentConnectors(agent), ...WORKFORCE_RUNTIME_CONTRACTS[agent].connectorDependencies.map((dep) => dep.provider)]));
}
