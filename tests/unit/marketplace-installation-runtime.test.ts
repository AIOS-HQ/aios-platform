import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireUser,
  mockCreateClient,
  mockPlanInstall,
  mockPlanUpdate,
  mockPlanRollback,
  mockPlanUninstall,
  mockLoadCatalog,
  mockLoadInstallState,
} = vi.hoisted(() => ({
  mockRequireUser: vi.fn(),
  mockCreateClient: vi.fn(),
  mockPlanInstall: vi.fn(),
  mockPlanUpdate: vi.fn(),
  mockPlanRollback: vi.fn(),
  mockPlanUninstall: vi.fn(),
  mockLoadCatalog: vi.fn(),
  mockLoadInstallState: vi.fn(),
}));

vi.mock("@/lib/auth/user", () => ({ requireUser: mockRequireUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mockCreateClient }));
vi.mock("@/lib/marketplace/install", () => ({
  planInstall: mockPlanInstall,
  planUpdate: mockPlanUpdate,
  planRollback: mockPlanRollback,
  planUninstall: mockPlanUninstall,
}));
vi.mock("@/lib/marketplace/persistence", () => ({
  loadCatalog: mockLoadCatalog,
  loadInstallState: mockLoadInstallState,
}));

import {
  installMarketplaceItem,
  rollbackMarketplaceItem,
  uninstallMarketplaceItem,
  updateMarketplaceItem,
  type InstallMarketplacePolicyInput,
  type UpdateMarketplacePolicyInput,
} from "@/lib/marketplace/actions";

function makeOwnedCompanySupabase() {
  const maybeSingle = vi.fn(async () => ({ data: { id: "company-1" } }));
  const eqChain2 = { eq: vi.fn(() => ({ maybeSingle })) };
  const eqChain1 = { eq: vi.fn(() => eqChain2) };
  const selectChain = { select: vi.fn(() => eqChain1) };

  const upsertInstallRows = vi.fn(async () => ({ error: null }));

  const upsertAuditRows = vi.fn(async () => ({ data: { id: "audit-1" }, error: null }));
  const selectAudit = vi.fn(() => ({ maybeSingle: upsertAuditRows }));
  const upsertAuditBuilder = {
    upsert: vi.fn(() => ({ select: selectAudit })),
  };

  const rpc = vi.fn(async () => ({ data: [{ applied: true, evidence_id: "audit-atomic-1" }], error: null }));

  const deleteEq2 = { eq: vi.fn(async () => ({ error: null })) };
  const deleteEq1 = { eq: vi.fn(() => deleteEq2) };
  const delBuilder = { delete: vi.fn(() => deleteEq1) };

  const from = vi.fn((table: string) => {
    if (table === "companies") return selectChain;
    if (table === "company_installations") {
      return {
        upsert: upsertInstallRows,
        ...delBuilder,
      };
    }
    if (table === "agent_autonomy_audit") return upsertAuditBuilder;
    throw new Error(`unexpected table ${table}`);
  });

  return {
    client: { from, rpc },
    upsertInstallRows,
    upsertAuditRows,
    upsertAuditBuilder,
    rpc,
  };
}

function validPolicyInput(overrides: Partial<InstallMarketplacePolicyInput["policyEvidence"]> = {}): InstallMarketplacePolicyInput {
  return {
    policyEvidence: {
      decision: "allow",
      approvedAt: "2026-08-07T10:00:00.000Z",
      evaluatedAt: "2026-08-07T09:59:59.000Z",
      actor: { type: "founder", id: "user-1" },
      agent: { id: "harmony" },
      companyId: "company-1",
      subject: {
        kind: "marketplace_install",
        itemId: "app",
        action: "install",
      },
      executionIdentity: {
        executionId: "exec-install-1",
        requestId: "req-install-1",
        correlationId: "corr-install-1",
      },
      ...overrides,
    },
  };
}

function validUpdatePolicyInput(
  overrides: Partial<UpdateMarketplacePolicyInput["policyEvidence"]> = {},
): UpdateMarketplacePolicyInput {
  return {
    policyEvidence: {
      decision: "allow",
      approvedAt: "2026-08-07T10:00:00.000Z",
      evaluatedAt: "2026-08-07T09:59:59.000Z",
      actor: { type: "founder", id: "user-1" },
      agent: { id: "harmony" },
      companyId: "company-1",
      subject: {
        kind: "marketplace_install",
        itemId: "app",
        action: "update",
        fromVersion: "1.0.0",
        toVersion: "2.0.0",
      },
      executionIdentity: {
        executionId: "exec-update-1",
        requestId: "req-update-1",
        correlationId: "corr-update-1",
      },
      ...overrides,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("marketplace installation runtime actions", () => {
  it("does not write when ownership check fails", async () => {
    mockRequireUser.mockResolvedValue({ id: "user-1" });

    const maybeSingle = vi.fn(async () => ({ data: null }));
    const eqChain2 = { eq: vi.fn(() => ({ maybeSingle })) };
    const eqChain1 = { eq: vi.fn(() => eqChain2) };
    const selectChain = { select: vi.fn(() => eqChain1) };

    const upsertAuditRows = vi.fn(async () => ({ data: { id: "audit-2" }, error: null }));
    const from = vi.fn((table: string) => {
      if (table === "companies") return selectChain;
      if (table === "agent_autonomy_audit") {
        return {
          upsert: vi.fn(() => ({ select: vi.fn(() => ({ maybeSingle: upsertAuditRows })) })),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    mockCreateClient.mockResolvedValue({ from });

    const result = await installMarketplaceItem("company-1", "app", undefined, validPolicyInput());

    expect(result.applied).toBe(false);
    expect(result.error).toBe("forbidden");
    expect(result.plan.blocked).toBe(true);
    expect(result.plan.reasons).toEqual(["Company not found or not owned"]);
    expect(mockLoadCatalog).not.toHaveBeenCalled();
    expect(mockLoadInstallState).not.toHaveBeenCalled();
  });

  it("blocks install when policy evidence is missing", async () => {
    const { client, rpc } = makeOwnedCompanySupabase();
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockCreateClient.mockResolvedValue(client);

    const result = await installMarketplaceItem("company-1", "app");

    expect(result.applied).toBe(false);
    expect(result.error).toBe("missing_policy_decision");
    expect(result.reasonCode).toBe("missing_policy_decision");
    expect(result.decision).toBe("blocked");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("blocks install when policy subject mismatches", async () => {
    const { client, rpc } = makeOwnedCompanySupabase();
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockCreateClient.mockResolvedValue(client);

    const badPolicy = validPolicyInput({
      subject: {
        kind: "marketplace_install",
        itemId: "different-item",
        action: "install",
      },
    });

    const result = await installMarketplaceItem("company-1", "app", undefined, badPolicy);

    expect(result.applied).toBe(false);
    expect(result.error).toBe("policy_subject_mismatch");
    expect(result.reasonCode).toBe("policy_subject_mismatch");
    expect(result.decision).toBe("blocked");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns blocked install plan without writes", async () => {
    const { client, rpc } = makeOwnedCompanySupabase();
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockCreateClient.mockResolvedValue(client);

    mockLoadCatalog.mockResolvedValue({});
    mockLoadInstallState.mockResolvedValue({});
    mockPlanInstall.mockReturnValue({
      action: "install",
      itemId: "app",
      fromVersion: null,
      toVersion: "1.0.0",
      steps: [],
      warnings: [],
      blocked: true,
      reasons: ["Missing dependency dep (1.x)"],
    });

    const result = await installMarketplaceItem("company-1", "app", undefined, validPolicyInput());

    expect(result.applied).toBe(false);
    expect(result.plan.blocked).toBe(true);
    expect(result.reasonCode).toBe("install_plan_blocked");
    expect(result.decision).toBe("blocked");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("applies install steps via deterministic upsert payload with valid policy", async () => {
    const { client, rpc } = makeOwnedCompanySupabase();
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockCreateClient.mockResolvedValue(client);

    mockLoadCatalog.mockResolvedValue({
      dep: { visibility: "marketplace_public" },
      app: { visibility: "company_private" },
    });
    mockLoadInstallState.mockResolvedValue({});
    mockPlanInstall.mockReturnValue({
      action: "install",
      itemId: "app",
      fromVersion: null,
      toVersion: "1.0.0",
      steps: [
        { itemId: "dep", kind: "skill", version: "1.2.0", reason: "dependency" },
        { itemId: "app", kind: "workforce", version: "1.0.0", reason: "requested" },
      ],
      warnings: [],
      blocked: false,
      reasons: [],
    });

    const result = await installMarketplaceItem("company-1", "app", undefined, validPolicyInput());

    expect(result.applied).toBe(true);
    expect(result.decision).toBe("applied");
    expect(result.reasonCode).toBe("install_applied");
    expect(rpc).toHaveBeenCalledTimes(1);

    const [rpcName, rpcInput] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(rpcName).toBe("marketplace_apply_install_with_evidence");
    const rows = rpcInput.p_rows as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      user_id: "user-1",
      company_id: "company-1",
      item_id: "dep",
      installed_version: "1.2.0",
      source: "marketplace_public",
      enabled: true,
    });
    expect(rows[1]).toMatchObject({
      user_id: "user-1",
      company_id: "company-1",
      item_id: "app",
      installed_version: "1.0.0",
      source: "company_private",
      enabled: true,
    });
  });

  it("treats repeated same-plan install as idempotent upsert without duplicate evidence", async () => {
    const { client, rpc } = makeOwnedCompanySupabase();
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockCreateClient.mockResolvedValue(client);

    mockLoadCatalog.mockResolvedValue({ app: { visibility: "marketplace_public" } });
    mockLoadInstallState.mockResolvedValue({});
    mockPlanInstall.mockReturnValue({
      action: "install",
      itemId: "app",
      fromVersion: null,
      toVersion: "1.0.0",
      steps: [{ itemId: "app", kind: "workforce", version: "1.0.0", reason: "requested" }],
      warnings: [],
      blocked: false,
      reasons: [],
    });

    const policy = validPolicyInput();
    await installMarketplaceItem("company-1", "app", undefined, policy);
    await installMarketplaceItem("company-1", "app", undefined, policy);

    expect(rpc).toHaveBeenCalledTimes(2);

    const firstPayload = rpc.mock.calls[0]?.[1];
    const secondPayload = rpc.mock.calls[1]?.[1];
    expect(firstPayload.p_evidence_execution_id).toBe(secondPayload.p_evidence_execution_id);
    expect(firstPayload.p_evidence_request_id).toBe(secondPayload.p_evidence_request_id);
    expect(firstPayload.p_evidence_correlation_id).toBe(secondPayload.p_evidence_correlation_id);
  });

  it("keeps no install state when atomic RPC fails before evidence success write", async () => {
    const { client, rpc, upsertAuditBuilder } = makeOwnedCompanySupabase();
    rpc.mockResolvedValueOnce({ data: null, error: { message: "atomic failure" } });
    upsertAuditBuilder.upsert.mockReturnValue({
      select: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { id: "audit-failure-2" }, error: null })) })),
    });

    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockCreateClient.mockResolvedValue(client);
    mockLoadCatalog.mockResolvedValue({ app: { visibility: "marketplace_public" } });
    mockLoadInstallState.mockResolvedValue({});
    mockPlanInstall.mockReturnValue({
      action: "install",
      itemId: "app",
      fromVersion: null,
      toVersion: "1.0.0",
      steps: [{ itemId: "app", kind: "workforce", version: "1.0.0", reason: "requested" }],
      warnings: [],
      blocked: false,
      reasons: [],
    });

    const result = await installMarketplaceItem("company-1", "app", undefined, validPolicyInput());

    expect(result.applied).toBe(false);
    expect(result.reasonCode).toBe("persistence_failed");
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("returns persistence error when upsert fails", async () => {
    const { client, rpc, upsertAuditBuilder } = makeOwnedCompanySupabase();
    rpc.mockResolvedValueOnce({ data: null, error: { message: "db down" } });
    upsertAuditBuilder.upsert.mockReturnValue({
      select: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { id: "audit-failure" }, error: null })) })),
    });

    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockCreateClient.mockResolvedValue(client);
    mockLoadCatalog.mockResolvedValue({ app: { visibility: "marketplace_public" } });
    mockLoadInstallState.mockResolvedValue({});
    mockPlanInstall.mockReturnValue({
      action: "install",
      itemId: "app",
      fromVersion: null,
      toVersion: "1.0.0",
      steps: [{ itemId: "app", kind: "workforce", version: "1.0.0", reason: "requested" }],
      warnings: [],
      blocked: false,
      reasons: [],
    });

    const result = await installMarketplaceItem("company-1", "app", undefined, validPolicyInput());

    expect(result.applied).toBe(false);
    expect(result.error).toBe("db down");
    expect(result.reasonCode).toBe("persistence_failed");
    expect(result.decision).toBe("blocked");
  });

  it("blocks update when policy evidence is missing", async () => {
    const { client, rpc } = makeOwnedCompanySupabase();
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockCreateClient.mockResolvedValue(client);

    const result = await updateMarketplaceItem("company-1", "app");

    expect(result.applied).toBe(false);
    expect(result.error).toBe("missing_policy_decision");
    expect(result.reasonCode).toBe("missing_policy_decision");
    expect(result.decision).toBe("blocked");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("blocks update when policy subject versions contradict planned update", async () => {
    const { client, rpc } = makeOwnedCompanySupabase();
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockCreateClient.mockResolvedValue(client);
    mockLoadCatalog.mockResolvedValue({ app: { visibility: "marketplace_public" } });
    mockLoadInstallState.mockResolvedValue({
      app: { kind: "workforce", installedVersion: "1.0.0", installedAt: "2026-01-01", source: "marketplace_public" },
    });
    mockPlanUpdate.mockReturnValue({
      action: "update",
      itemId: "app",
      fromVersion: "1.0.0",
      toVersion: "2.0.0",
      steps: [{ itemId: "app", kind: "workforce", version: "2.0.0", reason: "requested" }],
      warnings: [],
      blocked: false,
      reasons: [],
    });

    const result = await updateMarketplaceItem(
      "company-1",
      "app",
      validUpdatePolicyInput({
        subject: {
          kind: "marketplace_install",
          itemId: "app",
          action: "update",
          fromVersion: "1.0.0",
          toVersion: "9.9.9",
        },
      }),
    );

    expect(result.applied).toBe(false);
    expect(result.decision).toBe("blocked");
    expect(result.reasonCode).toBe("policy_subject_mismatch");
    expect(result.error).toBe("policy_subject_mismatch");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("applies governed update via existing persistence path with valid evidence", async () => {
    const { client, upsertInstallRows, rpc } = makeOwnedCompanySupabase();
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockCreateClient.mockResolvedValue(client);
    mockLoadCatalog.mockResolvedValue({ app: { visibility: "marketplace_public" } });
    mockLoadInstallState.mockResolvedValue({
      app: { kind: "workforce", installedVersion: "1.0.0", installedAt: "2026-01-01", source: "marketplace_public" },
    });

    mockPlanUpdate.mockReturnValue({
      action: "update",
      itemId: "app",
      fromVersion: "1.0.0",
      toVersion: "2.0.0",
      steps: [{ itemId: "app", kind: "workforce", version: "2.0.0", reason: "requested" }],
      warnings: [],
      blocked: false,
      reasons: [],
    });
    mockPlanRollback.mockReturnValue({
      action: "rollback",
      itemId: "app",
      fromVersion: "2.0.0",
      toVersion: "1.0.0",
      steps: [{ itemId: "app", kind: "workforce", version: "1.0.0", reason: "rollback" }],
      warnings: [],
      blocked: false,
      reasons: [],
    });

    const updated = await updateMarketplaceItem("company-1", "app", validUpdatePolicyInput());

    expect(updated.applied).toBe(true);
    expect(updated.decision).toBe("applied");
    expect(updated.reasonCode).toBe("update_applied");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]?.[0]).toBe("marketplace_apply_update_with_evidence");
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({
      p_company_id: "company-1",
      p_item_id: "app",
      p_evidence_from_version: "1.0.0",
      p_evidence_to_version: "2.0.0",
      p_reason_code: "update_applied",
    });
    expect(upsertInstallRows).toHaveBeenCalledTimes(0);

    const rolledBack = await rollbackMarketplaceItem("company-1", "app", "1.0.0");
    expect(rolledBack.applied).toBe(true);
  });

  it("produces deterministic idempotent update decision evidence for repeated equivalent updates", async () => {
    const { client, rpc, upsertAuditBuilder, upsertInstallRows } = makeOwnedCompanySupabase();
    const upsertAudit = upsertAuditBuilder.upsert as ReturnType<typeof vi.fn>;

    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockCreateClient.mockResolvedValue(client);
    mockLoadCatalog.mockResolvedValue({ app: { visibility: "marketplace_public" } });
    mockLoadInstallState.mockResolvedValue({
      app: { kind: "workforce", installedVersion: "1.0.0", installedAt: "2026-01-01", source: "marketplace_public" },
    });
    mockPlanUpdate.mockReturnValue({
      action: "update",
      itemId: "app",
      fromVersion: "1.0.0",
      toVersion: "2.0.0",
      steps: [{ itemId: "app", kind: "workforce", version: "2.0.0", reason: "requested" }],
      warnings: [],
      blocked: false,
      reasons: [],
    });

    const policy = validUpdatePolicyInput();
    const first = await updateMarketplaceItem("company-1", "app", policy);
    const second = await updateMarketplaceItem("company-1", "app", policy);

    expect(first.applied).toBe(true);
    expect(second.applied).toBe(true);
    expect(first.reasonCode).toBe("update_applied");
    expect(second.reasonCode).toBe("update_applied");
    expect(rpc).toHaveBeenCalledTimes(2);
    const firstRpc = rpc.mock.calls[0]?.[1] as { p_evidence_execution_id: string };
    const secondRpc = rpc.mock.calls[1]?.[1] as { p_evidence_execution_id: string };
    expect(firstRpc.p_evidence_execution_id).toBe(secondRpc.p_evidence_execution_id);
    expect(upsertAudit).toHaveBeenCalledTimes(0);
    expect(upsertInstallRows).toHaveBeenCalledTimes(0);
  });

  it("fails closed when atomic update rpc errors", async () => {
    const { client, rpc, upsertInstallRows, upsertAuditBuilder } = makeOwnedCompanySupabase();
    rpc.mockResolvedValueOnce({ data: null, error: { message: "atomic update failed" } });
    const upsertAudit = upsertAuditBuilder.upsert as ReturnType<typeof vi.fn>;

    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockCreateClient.mockResolvedValue(client);
    mockLoadCatalog.mockResolvedValue({ app: { visibility: "marketplace_public" } });
    mockLoadInstallState.mockResolvedValue({
      app: { kind: "workforce", installedVersion: "1.0.0", installedAt: "2026-01-01", source: "marketplace_public" },
    });
    mockPlanUpdate.mockReturnValue({
      action: "update",
      itemId: "app",
      fromVersion: "1.0.0",
      toVersion: "2.0.0",
      steps: [{ itemId: "app", kind: "workforce", version: "2.0.0", reason: "requested" }],
      warnings: [],
      blocked: false,
      reasons: [],
    });

    const result = await updateMarketplaceItem("company-1", "app", validUpdatePolicyInput());

    expect(result.applied).toBe(false);
    expect(result.reasonCode).toBe("persistence_failed");
    expect(result.error).toBe("atomic update failed");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(upsertInstallRows).toHaveBeenCalledTimes(0);
    expect(upsertAudit).toHaveBeenCalledTimes(1);
  });

  it("blocks uninstall plan without delete and applies delete when allowed", async () => {
    const maybeSingle = vi.fn(async () => ({ data: { id: "company-1" } }));
    const eqChain2 = { eq: vi.fn(() => ({ maybeSingle })) };
    const eqChain1 = { eq: vi.fn(() => eqChain2) };
    const selectChain = { select: vi.fn(() => eqChain1) };

    const deleteEq3 = vi.fn(async () => ({ error: null }));
    const deleteEq2 = { eq: vi.fn(() => ({ eq: deleteEq3 })) };
    const deleteEq1 = { eq: vi.fn(() => deleteEq2) };
    const delBuilder = { delete: vi.fn(() => deleteEq1) };

    const from = vi.fn((table: string) => {
      if (table === "companies") return selectChain;
      if (table === "company_installations") return delBuilder;
      throw new Error(`unexpected table ${table}`);
    });

    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockCreateClient.mockResolvedValue({ from });
    mockLoadCatalog.mockResolvedValue({});
    mockLoadInstallState.mockResolvedValue({
      app: { kind: "workforce", installedVersion: "1.0.0", installedAt: "2026-01-01", source: "marketplace_public" },
    });

    mockPlanUninstall
      .mockReturnValueOnce({
        action: "uninstall",
        itemId: "app",
        fromVersion: "1.0.0",
        toVersion: null,
        steps: [],
        warnings: [],
        blocked: true,
        reasons: ["Required by installed item(s): dep"],
      })
      .mockReturnValueOnce({
        action: "uninstall",
        itemId: "app",
        fromVersion: "1.0.0",
        toVersion: null,
        steps: [{ itemId: "app", kind: "workforce", version: "1.0.0", reason: "uninstall" }],
        warnings: [],
        blocked: false,
        reasons: [],
      });

    const blocked = await uninstallMarketplaceItem("company-1", "app");
    expect(blocked.applied).toBe(false);
    expect(deleteEq3).not.toHaveBeenCalled();

    const allowed = await uninstallMarketplaceItem("company-1", "app");
    expect(allowed.applied).toBe(true);
    expect(deleteEq3).toHaveBeenCalledTimes(1);
  });
});
