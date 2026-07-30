import { describe, expect, it } from "vitest";
import {
  composeStorefrontViewModel,
  type StorefrontContext,
  toDisplayItem,
} from "@/lib/marketplace/storefront";
import type { Catalog, MarketplaceItem } from "@/lib/marketplace/types";

function item(overrides: Partial<MarketplaceItem>): MarketplaceItem {
  return {
    id: overrides.id ?? "item-1",
    kind: overrides.kind ?? "skill",
    slug: overrides.slug ?? "item-1",
    name: overrides.name ?? "Item 1",
    description: overrides.description ?? "Description",
    publisherId: overrides.publisherId ?? "publisher-1",
    visibility: overrides.visibility ?? "marketplace_public",
    verification: overrides.verification ?? "verified",
    versions:
      overrides.versions ??
      [
        {
          version: "1.0.0",
          createdAt: "2026-07-01T00:00:00.000Z",
          dependencies: [],
          yanked: false,
        },
      ],
    ratings: overrides.ratings ?? [],
    tags: overrides.tags ?? [],
    createdAt: overrides.createdAt ?? "2026-07-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-07-01T00:00:00.000Z",
  };
}

function context(overrides?: Partial<StorefrontContext>): StorefrontContext {
  return {
    catalog: overrides?.catalog ?? {},
    signal:
      overrides?.signal ?? {
        industry: "saas",
        companyType: "startup",
        tags: ["growth"],
        installedItemIds: [],
      },
    installedIds: overrides?.installedIds ?? new Set<string>(),
    installCounts: overrides?.installCounts ?? {},
  };
}

describe("marketplace storefront composition", () => {
  it("is deterministic for identical inputs", () => {
    const catalog: Catalog = {
      "item-1": item({ id: "item-1", slug: "item-1", tags: ["alpha"], kind: "skill" }),
      "item-2": item({ id: "item-2", slug: "item-2", tags: ["beta"], kind: "workforce" }),
    };
    const input = context({
      catalog,
      installedIds: new Set(["item-1"]),
      installCounts: { "item-1": 3, "item-2": 2 },
    });

    const first = composeStorefrontViewModel(input);
    const second = composeStorefrontViewModel(input);

    expect(second).toEqual(first);
  });

  it("handles empty catalog gracefully", () => {
    const viewModel = composeStorefrontViewModel(context({ catalog: {} }));

    expect(viewModel.visibleItems).toEqual([]);
    expect(viewModel.displayItems).toEqual([]);
    expect(viewModel.discovery.defaultResult).toEqual([]);
    expect(viewModel.summary.totalVisibleItems).toBe(0);
  });

  it("projects install state and install counts", () => {
    const catalog: Catalog = {
      "item-1": item({ id: "item-1", slug: "item-1", kind: "connector" }),
    };
    const viewModel = composeStorefrontViewModel(
      context({
        catalog,
        installedIds: new Set(["item-1"]),
        installCounts: { "item-1": 11 },
      }),
    );

    expect(viewModel.installedIds.has("item-1")).toBe(true);
    expect(viewModel.installCounts["item-1"]).toBe(11);
    expect(viewModel.summary.installedItems).toBe(1);
    expect(viewModel.summary.totalInstallCount).toBe(11);
  });

  it("composes recommendations, collections, bundles, and discovery metadata", () => {
    const catalog: Catalog = {
      "item-1": item({ id: "item-1", slug: "item-1", kind: "workforce", tags: ["sales"] }),
      "item-2": item({ id: "item-2", slug: "item-2", kind: "dashboard", tags: ["ops"] }),
    };
    const viewModel = composeStorefrontViewModel(context({ catalog }));

    expect(viewModel.recommendations).toBeTruthy();
    expect(Array.isArray(viewModel.collections)).toBe(true);
    expect(viewModel.bundles.length).toBeGreaterThan(0);
    expect(viewModel.discovery.kinds).toEqual(expect.arrayContaining(["workforce", "dashboard"]));
    expect(viewModel.discovery.tags).toEqual(["ops", "sales"]);
  });

  it("preserves empty install-count behavior", () => {
    const catalog: Catalog = {
      "item-1": item({ id: "item-1", slug: "item-1" }),
    };
    const viewModel = composeStorefrontViewModel(context({ catalog, installCounts: {} }));

    expect(viewModel.installCounts).toEqual({});
    expect(viewModel.summary.totalInstallCount).toBe(0);
  });

  it("does not mutate input context or catalog items", () => {
    const frozenItem = Object.freeze(item({ id: "item-1", slug: "item-1", tags: ["alpha"] }));
    const frozenCatalog = Object.freeze({ "item-1": frozenItem }) as Catalog;
    const frozenIds = new Set<string>(["item-1"]);
    const frozenInput = Object.freeze(
      context({
        catalog: frozenCatalog,
        installedIds: frozenIds,
        installCounts: { "item-1": 1 },
      }),
    );

    const result = composeStorefrontViewModel(frozenInput);

    expect(result.visibleItems).toHaveLength(1);
    expect(frozenInput.catalog["item-1"]?.tags).toEqual(["alpha"]);
    expect(frozenInput.installedIds.has("item-1")).toBe(true);
  });

  it("maps MarketplaceItem to DisplayItem without introducing duplicates", () => {
    const source = item({
      id: "item-dup",
      slug: "worker-ops",
      kind: "workforce",
      versions: [
        {
          version: "1.0.0",
          createdAt: "2026-07-01T00:00:00.000Z",
          dependencies: [{ itemId: "dep-1", range: "^1.0.0" }],
          yanked: false,
        },
      ],
    });
    const display = toDisplayItem(source);

    expect(display.id).toBe("item-dup");
    expect(display.dependencies).toEqual(["dep-1"]);
  });
});
