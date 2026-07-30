import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const marketplacePage = readFileSync("src/app/(app)/harmony/marketplace/page.tsx", "utf8");
const discoverPage = readFileSync("src/app/(app)/harmony/marketplace/discover/page.tsx", "utf8");
const bundlesPage = readFileSync("src/app/(app)/harmony/marketplace/bundles/page.tsx", "utf8");

describe("marketplace storefront ui composition", () => {
  it("uses unified storefront view model in marketplace page", () => {
    expect(marketplacePage).toContain("loadStorefrontViewModel");
    expect(marketplacePage).not.toContain("loadCatalog(");
    expect(marketplacePage).not.toContain("loadInstallState(");
  });

  it("uses unified storefront recommendations and collections in discover page", () => {
    expect(discoverPage).toContain("loadStorefrontViewModel");
    expect(discoverPage).toContain("storefront.recommendations");
    expect(discoverPage).toContain("storefront.collections");
    expect(discoverPage).not.toContain("buildCollections({");
    expect(discoverPage).not.toContain("recommendForProfile(");
  });

  it("uses unified storefront bundles in bundles page", () => {
    expect(bundlesPage).toContain("loadStorefrontViewModel");
    expect(bundlesPage).toContain("storefront.bundles.map");
    expect(bundlesPage).not.toContain("BUNDLES.map(");
  });
});
