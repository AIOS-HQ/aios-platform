import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const navConfig = readFileSync("src/components/app/nav-config.ts", "utf8");
const marketplacePage = readFileSync("src/app/(app)/harmony/marketplace/page.tsx", "utf8");
const discoverPage = readFileSync("src/app/(app)/harmony/marketplace/discover/page.tsx", "utf8");
const bundlesPage = readFileSync("src/app/(app)/harmony/marketplace/bundles/page.tsx", "utf8");
const publishPage = readFileSync("src/app/(app)/harmony/marketplace/publish/page.tsx", "utf8");
const workerDetailPage = readFileSync("src/app/(app)/harmony/marketplace/workers/[key]/page.tsx", "utf8");
const actionsComponent = readFileSync("src/components/marketplace/marketplace-actions.tsx", "utf8");
const itemCard = readFileSync("src/components/marketplace/marketplace-item-card.tsx", "utf8");
const reviewsComponent = readFileSync("src/components/marketplace/marketplace-reviews.tsx", "utf8");
const publishForm = readFileSync("src/components/marketplace/publish-form.tsx", "utf8");

const marketplaceMessagesEn = JSON.parse(readFileSync("messages/marketplace/en.json", "utf8"));
const marketplaceMessagesEs = JSON.parse(readFileSync("messages/marketplace/es.json", "utf8"));

describe("marketplace founder/customer experience contracts", () => {
  it("keeps Marketplace in shared authenticated nav and points to shared route", () => {
    expect(navConfig).toContain('{ href: "/harmony/marketplace", labelKey: "marketplace", icon: "Boxes" }');
    expect(navConfig).toContain("SAME /harmony/marketplace page");
  });

  it("keeps marketplace pages composed from unified storefront view model", () => {
    expect(marketplacePage).toContain("loadStorefrontViewModel");
    expect(discoverPage).toContain("loadStorefrontViewModel");
    expect(bundlesPage).toContain("loadStorefrontViewModel");

    expect(marketplacePage).not.toContain("loadCatalog(");
    expect(discoverPage).not.toContain("buildCollections({");
    expect(discoverPage).not.toContain("recommendForProfile(");
    expect(bundlesPage).not.toContain("BUNDLES.map(");
  });

  it("keeps install lifecycle controls in shared action component", () => {
    expect(actionsComponent).toContain("installMarketplaceItem");
    expect(actionsComponent).toContain("updateMarketplaceItem");
    expect(actionsComponent).toContain("rollbackMarketplaceItem");
    expect(actionsComponent).toContain("uninstallMarketplaceItem");
    expect(actionsComponent).toContain("result.plan.reasons");
    expect(actionsComponent).toContain("result.applied");
    expect(actionsComponent).toContain("result.plan.blocked");
    expect(actionsComponent).toContain("result.plan.reasons");
  });

  it("keeps worker detail experience on shared marketplace route and actions", () => {
    expect(workerDetailPage).toContain('href="/harmony/marketplace"');
    expect(workerDetailPage).toContain("MarketplaceActions");
    expect(workerDetailPage).toContain("loadInstallState");
  });

  it("keeps publish and review UX with explicit error/success handling", () => {
    expect(publishPage).toContain("PublishForm");
    expect(publishForm).toContain("publishMarketplaceItem");
    expect(publishForm).toContain("router.push(\"/harmony/marketplace\")");
    expect(publishForm).toContain("setError");

    expect(reviewsComponent).toContain("submitReview");
    expect(reviewsComponent).toContain("setError");
    expect(reviewsComponent).toContain("setDone(true)");
    expect(reviewsComponent).toContain("setError");
  });

  it("keeps item-card UX contracts for details, dependencies, and review surface", () => {
    expect(itemCard).toContain("MarketplaceReviews");
    expect(itemCard).toContain("labels.dependencies");
    expect(itemCard).toContain("labels.details");
    expect(itemCard).toContain("line-clamp-2");
  });

  it("keeps marketplace i18n keys for recommendation/discovery/empty-state messaging", () => {
    expect(marketplaceMessagesEn.marketplace).toBeDefined();
    expect(marketplaceMessagesEn.marketplace.discover).toBeDefined();
    expect(marketplaceMessagesEn.marketplace.discover.recommended).toBeTruthy();
    expect(marketplaceMessagesEn.marketplace.discover.recommendedHint).toBeTruthy();
    expect(marketplaceMessagesEn.marketplace.title).toBeTruthy();
    expect(marketplaceMessagesEn.marketplace.subtitle).toBeTruthy();
    expect(marketplaceMessagesEn.marketplace.itemsCount).toBeTruthy();
    expect(marketplaceMessagesEn.marketplace.trust).toBeTruthy();
    expect(marketplaceMessagesEn.marketplace.empty).toBeDefined();

    expect(marketplaceMessagesEs.marketplace).toBeDefined();
    expect(marketplaceMessagesEs.marketplace.discover).toBeDefined();
    expect(marketplaceMessagesEs.marketplace.discover.recommended).toBeTruthy();
    expect(marketplaceMessagesEs.marketplace.title).toBeTruthy();
    expect(marketplaceMessagesEs.marketplace.subtitle).toBeTruthy();
    expect(marketplaceMessagesEs.marketplace.empty).toBeDefined();
  });
});
