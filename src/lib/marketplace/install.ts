/**
 * Pure install lifecycle planners for the marketplace: install, update,
 * rollback, uninstall. Each returns an InstallPlan describing exactly what would
 * change (dependencies first) without performing any I/O. A Founder-gated server
 * action executes an approved plan against persisted install-state.
 *
 * Marketplace items carry config/knowledge only, so installing a connector item
 * wires configuration; the operator re-consents credentials afterward — every
 * plan touching a connector surfaces that reminder as a warning.
 */

import type { Catalog, InstallPlan, InstallState, PlanStep } from "./types";
import { compareSemver, satisfies } from "./semver";
import { isPublicInstallable, latestVersion, resolveDependencies } from "./registry";

function reconsentWarning(steps: PlanStep[]): string[] {
  return steps.some((s) => s.kind === "connector")
    ? ["Connector items carry config only — re-consent credentials in the target company after install."]
    : [];
}

/** Plan installing an item (optionally pinned to `version`) and its dependencies. */
export function planInstall(
  catalog: Catalog,
  installed: InstallState,
  itemId: string,
  opts: { version?: string } = {},
): InstallPlan {
  const base: InstallPlan = {
    action: "install",
    itemId,
    fromVersion: installed[itemId]?.installedVersion ?? null,
    toVersion: null,
    steps: [],
    warnings: [],
    blocked: false,
    reasons: [],
  };

  const item = catalog[itemId];
  if (!item) return { ...base, blocked: true, reasons: [`Item ${itemId} not found in catalog`] };
  if (!isPublicInstallable(item)) {
    return { ...base, blocked: true, reasons: ["Public items must be verified before install"] };
  }

  const target = opts.version ?? latestVersion(item);
  if (!target) return { ...base, blocked: true, reasons: ["No installable (non-yanked) version"] };
  if (opts.version && !item.versions.some((v) => v.version === opts.version && !v.yanked)) {
    return { ...base, blocked: true, reasons: [`Version ${opts.version} is not installable`] };
  }
  base.toVersion = target;

  if (installed[itemId]?.installedVersion === target) {
    return { ...base, blocked: true, reasons: [`Already installed at ${target}`] };
  }

  const res = resolveDependencies(catalog, itemId, target);
  const reasons: string[] = [];
  if (res.missing.length) reasons.push(...res.missing.map((m) => `Missing dependency ${m.itemId} (${m.range})`));
  if (res.conflicts.length)
    reasons.push(...res.conflicts.map((c) => `Version conflict on ${c.itemId}: ${c.chosen} vs ${c.range}`));
  if (res.cycles.length) reasons.push(...res.cycles.map((c) => `Dependency cycle: ${c.join(" -> ")}`));
  if (reasons.length) return { ...base, blocked: true, reasons };

  // Only steps that aren't already satisfied at the resolved version.
  const steps = res.order.filter((s) => installed[s.itemId]?.installedVersion !== s.version);
  return { ...base, steps, warnings: reconsentWarning(steps) };
}

/** Plan updating an installed item to the latest newer version. */
export function planUpdate(catalog: Catalog, installed: InstallState, itemId: string): InstallPlan {
  const current = installed[itemId];
  const base: InstallPlan = {
    action: "update",
    itemId,
    fromVersion: current?.installedVersion ?? null,
    toVersion: null,
    steps: [],
    warnings: [],
    blocked: false,
    reasons: [],
  };
  if (!current) return { ...base, blocked: true, reasons: ["Not installed"] };
  const item = catalog[itemId];
  if (!item) return { ...base, blocked: true, reasons: [`Item ${itemId} not found`] };

  const target = latestVersion(item);
  if (!target) return { ...base, blocked: true, reasons: ["No installable version"] };
  base.toVersion = target;
  if (compareSemver(target, current.installedVersion) <= 0) {
    return { ...base, blocked: true, reasons: [`Already up to date at ${current.installedVersion}`] };
  }

  const res = resolveDependencies(catalog, itemId, target);
  const reasons: string[] = [];
  if (res.missing.length) reasons.push(...res.missing.map((m) => `Missing dependency ${m.itemId} (${m.range})`));
  if (res.conflicts.length)
    reasons.push(...res.conflicts.map((c) => `Version conflict on ${c.itemId}: ${c.chosen} vs ${c.range}`));
  if (res.cycles.length) reasons.push(...res.cycles.map((c) => `Dependency cycle: ${c.join(" -> ")}`));
  if (reasons.length) return { ...base, blocked: true, reasons };

  const steps = res.order.filter((s) => installed[s.itemId]?.installedVersion !== s.version);
  return { ...base, steps, warnings: reconsentWarning(steps) };
}

/** Plan rolling an installed item back to a specific prior version (yanked allowed). */
export function planRollback(
  catalog: Catalog,
  installed: InstallState,
  itemId: string,
  toVersion: string,
): InstallPlan {
  const current = installed[itemId];
  const base: InstallPlan = {
    action: "rollback",
    itemId,
    fromVersion: current?.installedVersion ?? null,
    toVersion,
    steps: [],
    warnings: [],
    blocked: false,
    reasons: [],
  };
  if (!current) return { ...base, blocked: true, reasons: ["Not installed"] };
  const item = catalog[itemId];
  if (!item) return { ...base, blocked: true, reasons: [`Item ${itemId} not found`] };
  if (!item.versions.some((v) => v.version === toVersion)) {
    return { ...base, blocked: true, reasons: [`Version ${toVersion} does not exist`] };
  }

  const targetVersion = item.versions.find((v) => v.version === toVersion);
  const dependencyReasons: string[] = [];
  for (const dependency of targetVersion?.dependencies ?? []) {
    const dependencyInstalled = installed[dependency.itemId];
    if (!dependencyInstalled) {
      dependencyReasons.push(`Missing dependency ${dependency.itemId} (${dependency.range})`);
      continue;
    }
    if (!satisfies(dependencyInstalled.installedVersion, dependency.range)) {
      dependencyReasons.push(
        `Version conflict on ${dependency.itemId}: ${dependencyInstalled.installedVersion} vs ${dependency.range}`,
      );
    }
  }
  if (dependencyReasons.length) return { ...base, blocked: true, reasons: dependencyReasons };

  if (compareSemver(toVersion, current.installedVersion) >= 0) {
    return { ...base, blocked: true, reasons: [`Target ${toVersion} is not older than current ${current.installedVersion}`] };
  }
  const step: PlanStep = { itemId, kind: item.kind, version: toVersion, reason: "rollback" };
  return { ...base, steps: [step], warnings: reconsentWarning([step]) };
}

/** Plan uninstalling an item, blocking when other installed items depend on it. */
export function planUninstall(catalog: Catalog, installed: InstallState, itemId: string): InstallPlan {
  const current = installed[itemId];
  const base: InstallPlan = {
    action: "uninstall",
    itemId,
    fromVersion: current?.installedVersion ?? null,
    toVersion: null,
    steps: [],
    warnings: [],
    blocked: false,
    reasons: [],
  };
  if (!current) return { ...base, blocked: true, reasons: ["Not installed"] };

  const dependents: string[] = [];
  for (const [otherId, inst] of Object.entries(installed)) {
    if (otherId === itemId) continue;
    const v = catalog[otherId]?.versions.find((x) => x.version === inst.installedVersion);
    if (v?.dependencies.some((d) => d.itemId === itemId)) dependents.push(otherId);
  }
  if (dependents.length) {
    return { ...base, blocked: true, reasons: [`Required by installed item(s): ${dependents.join(", ")}`] };
  }
  const item = catalog[itemId];
  return {
    ...base,
    steps: [{ itemId, kind: item?.kind ?? "skill", version: current.installedVersion, reason: "uninstall" }],
  };
}
