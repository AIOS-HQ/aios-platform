import { describe, expect, it } from "vitest";

import {
  planInstall,
  planRollback,
  planUninstall,
  planUpdate,
  resolveDependencies,
  compareSemver,
  type Catalog,
  type InstallState,
} from "@/lib/marketplace";

function buildCatalog(overrides?: Partial<Catalog>): Catalog {
  const base: Catalog = {
    dep: {
      id: "dep",
      kind: "skill",
      slug: "dep",
      name: "Dependency",
      description: "base dependency",
      publisherId: "pub",
      visibility: "marketplace_public",
      verification: "verified",
      versions: [
        { version: "1.0.0", createdAt: "2026-01-01", dependencies: [] },
        { version: "2.0.0", createdAt: "2026-02-01", dependencies: [] },
      ],
      ratings: [],
      tags: ["dep"],
      createdAt: "2026-01-01",
      updatedAt: "2026-02-01",
    },
    app: {
      id: "app",
      kind: "workforce",
      slug: "app",
      name: "App",
      description: "depends on dep",
      publisherId: "pub",
      visibility: "marketplace_public",
      verification: "verified",
      versions: [
        {
          version: "1.0.0",
          createdAt: "2026-03-01",
          dependencies: [{ itemId: "dep", range: ">=1.0.0 <2.0.0" }],
        },
        {
          version: "2.0.0",
          createdAt: "2026-04-01",
          dependencies: [{ itemId: "dep", range: ">=2.0.0 <3.0.0" }],
        },
      ],
      ratings: [],
      tags: ["app"],
      createdAt: "2026-03-01",
      updatedAt: "2026-04-01",
    },
    connector: {
      id: "connector",
      kind: "connector",
      slug: "connector",
      name: "Connector",
      description: "connector item",
      publisherId: "pub",
      visibility: "marketplace_public",
      verification: "verified",
      versions: [{ version: "1.0.0", createdAt: "2026-05-01", dependencies: [] }],
      ratings: [],
      tags: ["connector"],
      createdAt: "2026-05-01",
      updatedAt: "2026-05-01",
    },
  };
  return { ...base, ...(overrides ?? {}) };
}

describe("marketplace core engine contracts", () => {
  it("resolves dependencies successfully in deterministic post-order", () => {
    const catalog = buildCatalog();

    const first = resolveDependencies(catalog, "app", "2.0.0");
    const second = resolveDependencies(catalog, "app", "2.0.0");

    expect(first.missing).toEqual([]);
    expect(first.conflicts).toEqual([]);
    expect(first.cycles).toEqual([]);
    expect(first.order.map((s) => `${s.itemId}@${s.version}`)).toEqual(["dep@2.0.0", "app@2.0.0"]);
    expect(second).toEqual(first);
  });

  it("blocks install when dependency is missing with exact reason", () => {
    const catalog = buildCatalog({ dep: undefined as unknown as Catalog[string] });
    const installed: InstallState = {};

    const plan = planInstall(catalog, installed, "app", { version: "1.0.0" });

    expect(plan.blocked).toBe(true);
    expect(plan.reasons).toEqual(["Missing dependency dep (>=1.0.0 <2.0.0)"]);
  });

  it("blocks install on version conflicts with exact reason", () => {
    const catalog = buildCatalog({
      root: {
        id: "root",
        kind: "workflow_pack",
        slug: "root",
        name: "Root",
        description: "conflicting dependency ranges",
        publisherId: "pub",
        visibility: "marketplace_public",
        verification: "verified",
        versions: [
          {
            version: "1.0.0",
            createdAt: "2026-06-01",
            dependencies: [
              { itemId: "app", range: "1.x" },
              { itemId: "dep", range: "2.x" },
            ],
          },
        ],
        ratings: [],
        tags: ["root"],
        createdAt: "2026-06-01",
        updatedAt: "2026-06-01",
      },
    });

    const plan = planInstall(catalog, {}, "root", { version: "1.0.0" });

    expect(plan.blocked).toBe(true);
    expect(plan.reasons).toEqual(["Version conflict on dep: 1.0.0 vs 2.0.0"]);
  });

  it("detects dependency cycles and blocks install", () => {
    const catalog = buildCatalog({
      loopA: {
        id: "loopA",
        kind: "skill",
        slug: "loop-a",
        name: "Loop A",
        description: "cycle a",
        publisherId: "pub",
        visibility: "marketplace_public",
        verification: "verified",
        versions: [{ version: "1.0.0", createdAt: "2026-06-01", dependencies: [{ itemId: "loopB", range: "1.x" }] }],
        ratings: [],
        tags: [],
        createdAt: "2026-06-01",
        updatedAt: "2026-06-01",
      },
      loopB: {
        id: "loopB",
        kind: "skill",
        slug: "loop-b",
        name: "Loop B",
        description: "cycle b",
        publisherId: "pub",
        visibility: "marketplace_public",
        verification: "verified",
        versions: [{ version: "1.0.0", createdAt: "2026-06-01", dependencies: [{ itemId: "loopA", range: "1.x" }] }],
        ratings: [],
        tags: [],
        createdAt: "2026-06-01",
        updatedAt: "2026-06-01",
      },
    });

    const plan = planInstall(catalog, {}, "loopA", { version: "1.0.0" });

    expect(plan.blocked).toBe(true);
    expect(plan.reasons).toEqual(["Dependency cycle: loopA -> loopB -> loopA"]);
  });

  it("creates install plan steps and connector warning without mutating inputs", () => {
    const catalog = buildCatalog();
    const installed: InstallState = {};
    const frozenCatalog = structuredClone(catalog);
    const frozenInstalled = structuredClone(installed);

    const plan = planInstall(catalog, installed, "connector");

    expect(plan.blocked).toBe(false);
    expect(plan.steps.map((s) => `${s.itemId}@${s.version}`)).toEqual(["connector@1.0.0"]);
    expect(plan.warnings).toEqual([
      "Connector items carry config only — re-consent credentials in the target company after install.",
    ]);
    expect(catalog).toEqual(frozenCatalog);
    expect(installed).toEqual(frozenInstalled);
  });

  it("creates update plan from installed version to latest", () => {
    const catalog = buildCatalog();
    const installed: InstallState = {
      app: { kind: "workforce", installedVersion: "1.0.0", installedAt: "2026-06-15", source: "marketplace_public" },
      dep: { kind: "skill", installedVersion: "1.0.0", installedAt: "2026-06-15", source: "marketplace_public" },
    };

    const plan = planUpdate(catalog, installed, "app");

    expect(plan.blocked).toBe(false);
    expect(plan.fromVersion).toBe("1.0.0");
    expect(plan.toVersion).toBe("2.0.0");
    expect(plan.steps.map((s) => `${s.itemId}@${s.version}`)).toEqual(["dep@2.0.0", "app@2.0.0"]);
  });

  it("creates rollback plan to explicit prior version", () => {
    const catalog = buildCatalog();
    const installed: InstallState = {
      app: { kind: "workforce", installedVersion: "2.0.0", installedAt: "2026-06-20", source: "marketplace_public" },
      dep: { kind: "skill", installedVersion: "1.0.0", installedAt: "2026-06-20", source: "marketplace_public" },
    };

    const plan = planRollback(catalog, installed, "app", "1.0.0");

    expect(plan.blocked).toBe(false);
    expect(plan.fromVersion).toBe("2.0.0");
    expect(plan.toVersion).toBe("1.0.0");
    expect(plan.steps.map((s) => `${s.itemId}@${s.version}`)).toEqual(["app@1.0.0"]);
  });

  it("blocks rollback when target is the same version", () => {
    const catalog = buildCatalog();
    const installed: InstallState = {
      app: { kind: "workforce", installedVersion: "2.0.0", installedAt: "2026-06-20", source: "marketplace_public" },
    };

    const plan = planRollback(catalog, installed, "app", "2.0.0");
    expect(plan.blocked).toBe(true);
  });

  it("blocks rollback when target is newer", () => {
    const catalog = buildCatalog({
      app: {
        ...buildCatalog().app,
        versions: [...buildCatalog().app.versions, { version: "3.0.0", createdAt: "2026-05-01", dependencies: [] }],
      },
    });
    const installed: InstallState = {
      app: { kind: "workforce", installedVersion: "2.0.0", installedAt: "2026-06-20", source: "marketplace_public" },
    };

    const plan = planRollback(catalog, installed, "app", "3.0.0");
    expect(plan.blocked).toBe(true);
  });

  it("allows prerelease rollback ordering", () => {
    const catalog = buildCatalog({
      app: {
        ...buildCatalog().app,
        versions: [
          ...buildCatalog().app.versions,
          { version: "2.0.0-beta.1", createdAt: "2026-03-15", dependencies: [] },
        ],
      },
    });
    const installed: InstallState = {
      app: { kind: "workforce", installedVersion: "2.0.0", installedAt: "2026-06-20", source: "marketplace_public" },
    };

    const plan = planRollback(catalog, installed, "app", "2.0.0-beta.1");
    expect(plan.blocked).toBe(false);
  });

  it("fails closed on malformed rollback semver", () => {
    const catalog = buildCatalog({
      app: {
        ...buildCatalog().app,
        versions: [...buildCatalog().app.versions, { version: "not-semver", createdAt: "2026-03-15", dependencies: [] }],
      },
    });
    const installed: InstallState = {
      app: { kind: "workforce", installedVersion: "2.0.0", installedAt: "2026-06-20", source: "marketplace_public" },
    };

    const plan = planRollback(catalog, installed, "app", "not-semver");
    expect(plan.blocked).toBe(true);
  });

  it("keeps semver precedence independent from build metadata", () => {
    expect(compareSemver("1.2.3+build.1", "1.2.3+build.2")).toBe(0);
    expect(compareSemver("1.2.3-beta+build.1", "1.2.3-beta+build.2")).toBe(0);
    expect(compareSemver("1.2.3-beta-one+build.1", "1.2.3-beta-one+build.2")).toBe(0);
  });

  it("blocks rollback when required dependency is missing", () => {
    const catalog = buildCatalog();
    const installed: InstallState = {
      app: { kind: "workforce", installedVersion: "2.0.0", installedAt: "2026-06-20", source: "marketplace_public" },
    };

    const plan = planRollback(catalog, installed, "app", "1.0.0");

    expect(plan.blocked).toBe(true);
    expect(plan.reasons).toEqual(["Missing dependency dep (>=1.0.0 <2.0.0)"]);
  });

  it("blocks rollback when installed dependency is incompatible", () => {
    const catalog = buildCatalog();
    const installed: InstallState = {
      app: { kind: "workforce", installedVersion: "2.0.0", installedAt: "2026-06-20", source: "marketplace_public" },
      dep: { kind: "skill", installedVersion: "2.0.0", installedAt: "2026-06-20", source: "marketplace_public" },
    };

    const plan = planRollback(catalog, installed, "app", "1.0.0");

    expect(plan.blocked).toBe(true);
    expect(plan.reasons).toEqual(["Version conflict on dep: 2.0.0 vs >=1.0.0 <2.0.0"]);
  });

  it("creates uninstall plan and blocks uninstall when dependents exist", () => {
    const catalog = buildCatalog();
    const installed: InstallState = {
      app: { kind: "workforce", installedVersion: "1.0.0", installedAt: "2026-06-20", source: "marketplace_public" },
      dep: { kind: "skill", installedVersion: "1.0.0", installedAt: "2026-06-20", source: "marketplace_public" },
    };

    const blocked = planUninstall(catalog, installed, "dep");
    expect(blocked.blocked).toBe(true);
    expect(blocked.reasons).toEqual(["Required by installed item(s): app"]);

    const allowed = planUninstall(catalog, installed, "app");
    expect(allowed.blocked).toBe(false);
    expect(allowed.steps.map((s) => s.itemId)).toEqual(["app"]);
  });

  it("enforces public/verified installability rules where relevant", () => {
    const catalog = buildCatalog({
      app: {
        ...buildCatalog().app,
        verification: "unverified",
      },
    });

    const plan = planInstall(catalog, {}, "app", { version: "1.0.0" });

    expect(plan.blocked).toBe(true);
    expect(plan.reasons).toEqual(["Public items must be verified before install"]);
  });

  it("produces deterministic plan output for identical inputs", () => {
    const catalog = buildCatalog();
    const installed: InstallState = {
      dep: { kind: "skill", installedVersion: "1.0.0", installedAt: "2026-06-20", source: "marketplace_public" },
    };

    const first = planInstall(catalog, installed, "app", { version: "1.0.0" });
    const second = planInstall(catalog, installed, "app", { version: "1.0.0" });

    expect(second).toEqual(first);
  });
});
