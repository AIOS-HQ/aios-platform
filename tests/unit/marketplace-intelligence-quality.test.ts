import { describe, expect, it } from "vitest";

import {
  aiRecommendedBundles,
  buildCollections,
  companiesLikeYours,
  recommendForProfile,
  searchMarketplace,
  type Catalog,
  type CompanyProfileSignal,
} from "@/lib/marketplace";

const signal: CompanyProfileSignal = {
  industry: "SaaS",
  companyType: "B2B SaaS",
  tags: ["growth", "automation", "revenue"],
  connectors: ["hubspot", "slack"],
  departments: ["sales", "marketing"],
  installedItemIds: ["installed-worker"],
};

const catalog: Catalog = {
  "installed-worker": {
    id: "installed-worker",
    kind: "workforce",
    slug: "installed-worker",
    name: "Installed Worker",
    description: "already installed",
    publisherId: "pub",
    visibility: "marketplace_public",
    verification: "verified",
    versions: [{ version: "1.0.0", createdAt: "2026-01-01", dependencies: [] }],
    ratings: [{ userId: "u1", stars: 5, createdAt: "2026-01-01" }],
    tags: ["growth"],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  },
  "growth-worker": {
    id: "growth-worker",
    kind: "workforce",
    slug: "growth-worker",
    name: "Growth Catalyst",
    description: "drives growth and demand",
    publisherId: "pub",
    visibility: "marketplace_public",
    verification: "verified",
    versions: [{ version: "1.1.0", createdAt: "2026-01-02", dependencies: [] }],
    ratings: [
      { userId: "u1", stars: 5, createdAt: "2026-01-01" },
      { userId: "u2", stars: 4, createdAt: "2026-01-02" },
    ],
    tags: ["growth", "marketing", "saas"],
    createdAt: "2026-01-02",
    updatedAt: "2026-01-02",
  },
  "sales-dept": {
    id: "sales-dept",
    kind: "department",
    slug: "sales-dept",
    name: "Revenue Department",
    description: "sales pipeline and revenue operations",
    publisherId: "pub",
    visibility: "marketplace_public",
    verification: "verified",
    versions: [{ version: "2.0.0", createdAt: "2026-01-03", dependencies: [] }],
    ratings: [{ userId: "u1", stars: 4, createdAt: "2026-01-01" }],
    tags: ["sales", "revenue", "b2b"],
    createdAt: "2026-01-03",
    updatedAt: "2026-01-03",
  },
  "hubspot-connector": {
    id: "hubspot-connector",
    kind: "connector",
    slug: "hubspot-connector",
    name: "HubSpot Connector",
    description: "crm connector for revenue teams",
    publisherId: "pub",
    visibility: "marketplace_public",
    verification: "verified",
    versions: [{ version: "1.0.0", createdAt: "2026-01-04", dependencies: [] }],
    ratings: [{ userId: "u1", stars: 3, createdAt: "2026-01-01" }],
    tags: ["hubspot", "crm", "sales"],
    createdAt: "2026-01-04",
    updatedAt: "2026-01-04",
  },
  "marketing-dashboard": {
    id: "marketing-dashboard",
    kind: "dashboard",
    slug: "marketing-dashboard",
    name: "Marketing Dashboard",
    description: "campaign analytics for growth",
    publisherId: "pub",
    visibility: "marketplace_public",
    verification: "verified",
    versions: [{ version: "1.0.0", createdAt: "2026-01-05", dependencies: [] }],
    ratings: [{ userId: "u1", stars: 4, createdAt: "2026-01-01" }],
    tags: ["marketing", "campaign", "analytics"],
    createdAt: "2026-01-05",
    updatedAt: "2026-01-05",
  },
  "private-unverified": {
    id: "private-unverified",
    kind: "skill",
    slug: "private-unverified",
    name: "Unverified Public Skill",
    description: "should not be installable in public recommendations",
    publisherId: "pub",
    visibility: "marketplace_public",
    verification: "unverified",
    versions: [{ version: "1.0.0", createdAt: "2026-01-06", dependencies: [] }],
    ratings: [],
    tags: ["automation"],
    createdAt: "2026-01-06",
    updatedAt: "2026-01-06",
  },
};

describe("marketplace intelligence quality contracts", () => {
  it("returns deterministic recommendation sets and excludes installed items", () => {
    const first = recommendForProfile(signal, catalog, 5);
    const second = recommendForProfile(signal, catalog, 5);

    expect(second).toEqual(first);
    expect(first.workers.some((item) => item.id === "installed-worker")).toBe(false);
    expect(first.skills.some((item) => item.id === "private-unverified")).toBe(false);
  });

  it("provides customer-profile matching and bundle optimization deterministically", () => {
    const firstBundles = aiRecommendedBundles(signal, 3);
    const secondBundles = aiRecommendedBundles(signal, 3);
    const templates = companiesLikeYours(signal, 3);

    expect(secondBundles).toEqual(firstBundles);
    expect(firstBundles.length).toBeLessThanOrEqual(3);
    expect(templates.length).toBeLessThanOrEqual(3);
  });

  it("suppresses duplicates in discovery and handles empty/sparse catalogs", () => {
    const results = searchMarketplace("growth growth saas", catalog, {
      kinds: ["workforce", "department", "connector"],
      verifiedOnly: true,
    });

    const ids = results.map((result) => result.item.id);
    expect(new Set(ids).size).toBe(ids.length);

    const emptyRecommendations = recommendForProfile(signal, {}, 5);
    expect(emptyRecommendations.workers).toEqual([]);
    expect(emptyRecommendations.departments).toEqual([]);
    expect(emptyRecommendations.skills).toEqual([]);
    expect(emptyRecommendations.connectors).toEqual([]);
    expect(emptyRecommendations.dashboards).toEqual([]);
    expect(emptyRecommendations.workflowPacks).toEqual([]);

    const emptyCollections = buildCollections({
      catalog: {},
      signal,
      installCounts: {},
      limit: 6,
    });
    expect(emptyCollections).toEqual([]);
  });

  it("keeps stable explainable contracts for recommendations and collections", () => {
    const recommendations = recommendForProfile(signal, catalog, 4);
    expect(recommendations).toHaveProperty("workers");
    expect(recommendations).toHaveProperty("departments");
    expect(recommendations).toHaveProperty("skills");
    expect(recommendations).toHaveProperty("connectors");
    expect(recommendations).toHaveProperty("dashboards");
    expect(recommendations).toHaveProperty("workflowPacks");
    expect(recommendations).toHaveProperty("bundles");
    expect(recommendations).toHaveProperty("companiesLikeYours");

    const collections = buildCollections({
      catalog,
      signal,
      installCounts: {
        "growth-worker": 20,
        "sales-dept": 18,
        "hubspot-connector": 10,
      },
      limit: 6,
    });

    const slugs = collections.map((collection) => collection.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(collections.every((collection) => collection.items.length > 0)).toBe(true);
    expect(collections.some((collection) => collection.slug === "ai-recommended")).toBe(true);
  });
});
