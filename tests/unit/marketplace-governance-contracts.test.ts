import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  isPublicInstallable,
  latestVersion,
  type MarketplaceItem,
  type VerificationStatus,
} from "@/lib/marketplace";

function mkItem(overrides: Partial<MarketplaceItem> = {}): MarketplaceItem {
  return {
    id: overrides.id ?? "item-1",
    kind: overrides.kind ?? "skill",
    slug: overrides.slug ?? "item-1",
    name: overrides.name ?? "Item",
    description: overrides.description ?? "desc",
    publisherId: overrides.publisherId ?? "publisher-1",
    visibility: overrides.visibility ?? "marketplace_public",
    verification: overrides.verification ?? ("verified" as VerificationStatus),
    versions:
      overrides.versions ?? [
        { version: "1.0.0", createdAt: "2026-01-01", dependencies: [], yanked: false },
        { version: "1.1.0", createdAt: "2026-01-02", dependencies: [], yanked: false },
      ],
    ratings: overrides.ratings ?? [],
    tags: overrides.tags ?? [],
    createdAt: overrides.createdAt ?? "2026-01-01",
    updatedAt: overrides.updatedAt ?? "2026-01-02",
  };
}

describe("marketplace governance contracts", () => {
  it("enforces public installability gate by verification state", () => {
    const verifiedPublic = mkItem({ visibility: "marketplace_public", verification: "verified" });
    const unverifiedPublic = mkItem({ visibility: "marketplace_public", verification: "unverified" });
    const pendingPublic = mkItem({ visibility: "marketplace_public", verification: "pending" });
    const rejectedPublic = mkItem({ visibility: "marketplace_public", verification: "rejected" });
    const privateUnverified = mkItem({ visibility: "company_private", verification: "unverified" });

    expect(isPublicInstallable(verifiedPublic)).toBe(true);
    expect(isPublicInstallable(unverifiedPublic)).toBe(false);
    expect(isPublicInstallable(pendingPublic)).toBe(false);
    expect(isPublicInstallable(rejectedPublic)).toBe(false);
    expect(isPublicInstallable(privateUnverified)).toBe(true);
  });

  it("treats fully yanked releases as non-installable", () => {
    const item = mkItem({
      versions: [
        { version: "1.0.0", createdAt: "2026-01-01", dependencies: [], yanked: true },
        { version: "1.1.0", createdAt: "2026-01-02", dependencies: [], yanked: true },
      ],
    });

    expect(latestVersion(item)).toBeNull();
  });

  it("keeps publish action constrained to private/unverified initial state", () => {
    const publishActions = readFileSync("src/lib/marketplace/publish-actions.ts", "utf8");

    expect(publishActions).toContain('visibility: "company_private"');
    expect(publishActions).toContain('verification: "unverified"');
  });

  it("keeps migration governance contracts for owner isolation and public-read gate", () => {
    const migration = readFileSync("supabase/migrations/20260723100000_reconcile_marketplace_persistence.sql", "utf8");

    expect(migration).toContain('create policy "select_own_or_public_verified"');
    expect(migration).toContain("visibility='marketplace_public' and verification='verified'");
    expect(migration).toContain('create policy "owner_insert_private"');
    expect(migration).toContain("visibility='company_private' and verification='unverified'");
    expect(migration).toContain('create policy "owner_update"');
    expect(migration).toContain('create policy "owner_delete"');
    expect(migration).toContain('create policy "rater_insert"');
    expect(migration).toContain('create policy "rater_update"');
    expect(migration).toContain('create policy "rater_delete"');
  });

  it("keeps service-role verification workflows constrained to privileged writes", () => {
    const migration = readFileSync("supabase/migrations/20260723100000_reconcile_marketplace_persistence.sql", "utf8");

    expect(migration).toContain('grant select, insert, update, delete on table public.marketplace_items to authenticated, service_role');
    expect(migration).toContain('grant select, insert, update, delete on table public.marketplace_item_versions to authenticated, service_role');
    expect(migration).toContain('grant execute on function public.marketplace_install_counts() to authenticated, service_role');
    expect(migration).toContain('revoke all privileges on table public.marketplace_items from anon');
  });

  it("documents certified governance boundaries and installability gating", () => {
    const constitution = readFileSync("docs/CONSTITUTION_HISTORY.md", "utf8");

    expect(constitution).toContain("install/update/rollback/uninstall planning");
    expect(constitution).toContain("verified");
  });
});
