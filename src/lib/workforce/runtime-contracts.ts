import type { AiosAgentKey } from "@/lib/workforce/registry";

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

export const WORKFORCE_RUNTIME_CONTRACTS: Record<AiosAgentKey, WorkforceRuntimeContract> = {
  harmony: {
    key: "harmony",
    availableSkills: ["Julius recall", "Company Skills consultation", "Organizational intelligence", "Adaptive planning"],
    availableTools: ["A2A delegation", "Work queue", "Approval routing", "Connector runtime"],
    connectorDependencies: [
      { provider: "whatsapp", purpose: "WhatsApp channel is framework-only metadata", capabilities: ["send_message"], required: false },
      { provider: "messenger", purpose: "Messenger channel is framework-only metadata", capabilities: ["send_message"], required: false },
      { provider: "instagram", purpose: "Instagram channel is framework-only metadata", capabilities: ["send_message"], required: false },
    ],
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
    availableTools: ["Mason runtime", "GitHub connector", "Vercel diagnostics", "Validation suite"],
    connectorDependencies: [
      { provider: "github", purpose: "Repository and pull-request execution", capabilities: ["read_repo", "write_repo", "create_pr", "merge_pr"], required: true },
      { provider: "vercel", purpose: "Deployment diagnostics and preview verification", capabilities: ["deployment_status", "build_status", "list_deployments"], required: false },
    ],
    runtimeHandlers: ["runMasonTask", "executeValidatedPatch", "emitMasonReport"],
    delegationCapability: "send_receive",
    executionCapability: "real_runtime",
    approvalPolicy: "Founder-only execution; merge/deploy actions require explicit approval.",
    autonomyPolicy: "Can implement on branch + prepare PR evidence; no direct production mutation.",
    unsupportedCapabilities: ["Direct production editing", "Unapproved merge", "Repository deletion"],
  },
  catalyst: {
    key: "catalyst",
    availableSkills: ["Content planning", "Campaign drafting", "Growth experimentation"],
    availableTools: ["Social publishing runtime", "Approval routing", "Work queue"],
    connectorDependencies: [
      { provider: "linkedin", purpose: "LinkedIn publishing in Harmony Social", capabilities: ["textPost", "documentCarousel"], required: false },
      { provider: "x", purpose: "X publishing in Harmony Social", capabilities: ["textPost", "imagePost", "multiImagePost"], required: false },
      { provider: "youtube", purpose: "YouTube publishing in Harmony Social", capabilities: ["upload_video", "upload_short", "upload_thumbnail", "edit_metadata", "schedule_publish"], required: false },
    ],
    runtimeHandlers: ["queueDraft", "runSocialPublishAdapter", "requestApproval"],
    delegationCapability: "send_receive",
    executionCapability: "guided_runtime",
    approvalPolicy: "Publishing requires Harmony Social approval and governance checks.",
    autonomyPolicy: "Draft and prep autonomously; publish only through governed approval path.",
    unsupportedCapabilities: ["Ungoverned publishing", "Claiming live publish success without adapter evidence"],
  },
  ambassador: {
    key: "ambassador",
    availableSkills: ["Channel communications", "Routing & triage", "Low-risk autonomous replies"],
    availableTools: ["Comms channels", "Knowledge retrieval", "Approval routing"],
    connectorDependencies: [
      { provider: "whatsapp", purpose: "WhatsApp channel is framework-only metadata", capabilities: ["send_message"], required: false },
      { provider: "messenger", purpose: "Messenger channel is framework-only metadata", capabilities: ["send_message"], required: false },
      { provider: "instagram", purpose: "Instagram channel is framework-only metadata", capabilities: ["send_message"], required: false },
    ],
    runtimeHandlers: ["routeConversation", "sendReply", "requestApproval"],
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
