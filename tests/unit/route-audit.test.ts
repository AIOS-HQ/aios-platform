import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  isNavItemActive,
  navSections,
  sectionsForAudience,
  isFounderHarmonyPath,
  flattenNavItems,
} from "@/components/app/nav-config";
import {
  SETTINGS_ROUTE_CARDS,
  settingsRouteCardsForRole,
} from "@/lib/settings/routes";
import { safeRedirectPath } from "@/lib/auth/redirects";

function routeExists(href: string): boolean {
  const clean = href.split(/[?#]/)[0];
  if (!clean.startsWith("/")) return true;
  if (clean.startsWith("/api/")) {
    return fs.existsSync(path.join(process.cwd(), "src/app", clean, "route.ts"));
  }
  const rel = clean === "/" ? "" : clean.slice(1);
  return [
    path.join(process.cwd(), "src/app/(app)", rel, "page.tsx"),
    path.join(process.cwd(), "src/app/(auth)", rel, "page.tsx"),
    path.join(process.cwd(), "src/app", rel, "page.tsx"),
    path.join(process.cwd(), "src/app/(app)", rel, "route.ts"),
    path.join(process.cwd(), "src/app", rel, "route.ts"),
  ].some(fs.existsSync);
}

describe("launch route audit", () => {
  const customerSidebarRoutes = [
    "/harmony/operator",
    "/harmony/personal",
    "/harmony/onboarding",
    "/harmony/tasks",
    "/harmony/goals",
    "/harmony/notes",
    "/harmony/marketplace",
    "/settings/memory",
    "/settings/learning",
    "/settings/activity",
    "/settings/approvals",
    "/settings/integrations",
    "/settings/connections",
    "/settings/diagnostics",
    "/settings/billing",
    "/settings",
  ];

  it("keeps every founder sidebar route backed by an app route", () => {
    const founderRoutes = flattenNavItems(sectionsForAudience(true)).map((item) => item.href);
    expect(founderRoutes).toContain("/settings/auditor");
    expect(founderRoutes).toContain("/harmony/social");
    expect(founderRoutes).toContain("/harmony/customer-experience");
    expect(founderRoutes).toContain("/harmony/customer-experience/preview");
    expect(founderRoutes).toContain("/harmony/website");
    expect(founderRoutes).toContain("/harmony/website/analytics");
    expect(founderRoutes.filter((href) => !routeExists(href))).toEqual([]);
  });

  it("keeps every subscriber sidebar route backed by an app route and founder-free", () => {
    const subscriberRoutes = flattenNavItems(sectionsForAudience(false)).map((item) => item.href);
    expect(subscriberRoutes).toEqual(customerSidebarRoutes);
    expect(subscriberRoutes).not.toContain("/settings/auditor");
    expect(subscriberRoutes).not.toContain("/harmony/auditor");
    expect(subscriberRoutes).not.toContain("/harmony/code");
    expect(subscriberRoutes).not.toContain("/harmony/mason");
    expect(subscriberRoutes).not.toContain("/settings/mason");
    expect(subscriberRoutes).not.toContain("/harmony/workforce");
    expect(subscriberRoutes).not.toContain("/harmony/oversight");
    expect(subscriberRoutes).not.toContain("/harmony/customer-experience");
    expect(subscriberRoutes).not.toContain("/harmony/website");
    expect(subscriberRoutes.filter((href) => !routeExists(href))).toEqual([]);
  });

  it("keeps mobile and desktop navigation on the same source config", () => {
    expect(navSections.length).toBeGreaterThan(0);
    expect(sectionsForAudience(true)).toEqual(sectionsForAudience(true));
    expect(sectionsForAudience(false)).toEqual(sectionsForAudience(false));
    expect(flattenNavItems(sectionsForAudience(true)).map((item) => item.href)).toContain(
      "/harmony/social",
    );
    expect(flattenNavItems(sectionsForAudience(false)).map((item) => item.href)).toEqual(
      customerSidebarRoutes,
    );
  });

  it("surfaces Social once under the Harmony primary item", () => {
    const allItems = sectionsForAudience(true).flatMap((section) =>
      flattenNavItems([section]).map((item) => ({ section, item })),
    );
    const primary = sectionsForAudience(true).find((section) => section.titleKey === "primary");
    const harmony = primary?.items.find((item) => item.labelKey === "operator");
    const socialItems = allItems.filter(({ item }) => item.href === "/harmony/social");
    expect(socialItems).toHaveLength(1);
    expect(harmony?.children?.map((item) => item.href)).toEqual(["/harmony/social"]);
    expect(socialItems[0].section.titleKey).toBe("primary");
    expect(socialItems[0].item.labelKey).toBe("social");
    expect(flattenNavItems(sectionsForAudience(false)).map((item) => item.href)).not.toContain(
      "/harmony/social",
    );
    expect(allItems.map(({ item }) => item.labelKey)).not.toContain("harmonySocial");
  });

  it("keeps Social active for nested Harmony Social paths", () => {
    const socialItem = flattenNavItems(sectionsForAudience(true))
      .find((item) => item.href === "/harmony/social");
    expect(socialItem).toBeDefined();
    expect(isNavItemActive("/harmony/social", socialItem!)).toBe(true);
    expect(isNavItemActive("/harmony/social/drafts", socialItem!)).toBe(true);
    expect(isNavItemActive("/harmony/socialize", socialItem!)).toBe(false);
  });

  it("keeps every settings card route backed by an app route", () => {
    expect(SETTINGS_ROUTE_CARDS.map((card) => card.href).filter((href) => !routeExists(href))).toEqual([]);
  });

  it("keeps settings launchers from being the customer access point for major AIOS areas", () => {
    expect(settingsRouteCardsForRole(false).map((card) => card.href)).toEqual([]);
    expect(settingsRouteCardsForRole(true).map((card) => card.href)).toContain(
      "/settings/auditor",
    );
    expect(settingsRouteCardsForRole(true).map((card) => card.href)).not.toContain(
      "/settings/integrations",
    );
  });

  it("keeps founder Harmony routes default-deny for subscribers", () => {
    expect(isFounderHarmonyPath("/harmony")).toBe(true);
    expect(isFounderHarmonyPath("/harmony/code")).toBe(true);
    expect(isFounderHarmonyPath("/harmony/social")).toBe(true);
    expect(isFounderHarmonyPath("/harmony/customer-experience")).toBe(true);
    expect(isFounderHarmonyPath("/harmony/website")).toBe(true);
    expect(isFounderHarmonyPath("/harmony/workforce")).toBe(true);
    expect(isFounderHarmonyPath("/harmony/mason")).toBe(true);
    expect(isFounderHarmonyPath("/harmony/not-yet-known")).toBe(true);
    expect(isFounderHarmonyPath("/harmony/personal")).toBe(false);
    expect(isFounderHarmonyPath("/harmony/tasks")).toBe(false);
  });

  it("preserves only same-origin path redirects after login", () => {
    expect(safeRedirectPath("/pricing")).toBe("/pricing");
    expect(safeRedirectPath("/settings/connections")).toBe("/settings/connections");
    expect(safeRedirectPath("//example.com")).toBe("/harmony");
    expect(safeRedirectPath("https://example.com")).toBe("/harmony");
    expect(safeRedirectPath(null)).toBe("/harmony");
  });

  it("keeps Social under the authenticated Harmony layout", () => {
    expect(routeExists("/harmony/social")).toBe(true);
    expect(fs.existsSync(path.join(process.cwd(), "src/app/(app)/layout.tsx"))).toBe(true);
    expect(fs.existsSync(path.join(process.cwd(), "src/app/(app)/harmony/layout.tsx"))).toBe(true);
  });

  it("keeps the Social page wired to test drafts, approval, and truthful YouTube status", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/app/(app)/harmony/social/page.tsx"),
      "utf8",
    );
    expect(source).toContain("prepareLinkedInTestDraft");
    expect(source).toContain("prepareXTestDraft");
    expect(source).toContain("prepareYouTubeDraft");
    expect(source).toContain("approveSocialDraft");
    expect(source).toContain("publishSocialDraft");
    expect(source).toContain("Provider health");
    expect(source).toContain("Provider operations");
    expect(source).toContain("Outstanding Founder actions");
    expect(source).toContain("Pending approvals");
    expect(source).toContain("Approved drafts");
    expect(source).toContain("Rejected drafts");
    expect(source).toContain("Failed / retry available");
    expect(source).toContain("Scheduled work");
    expect(source).toContain("Published history");
    expect(source).toContain("Safe diagnostics");
    expect(source).toContain("Channel switching");
    expect(source).toContain("Playlist selection");
    expect(source).toContain("Video upload");
    expect(source).toContain("Thumbnail upload");
    expect(source).toContain("Scheduled publishing");
    expect(source).toContain("Shorts publishing");
    expect(source).toContain("Prepare YouTube draft");
    expect(source).toContain("Scheduled publish time");
    expect(source).toContain("Retry publish");
    expect(source).not.toContain("access_token");
    expect(source).not.toContain("refresh_token");
    expect(source).not.toContain("client_secret");
    expect(source).not.toContain("Harmony Social Publishing");
  });
});
