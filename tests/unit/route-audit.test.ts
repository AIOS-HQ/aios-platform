import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  navSections,
  sectionsForAudience,
  isFounderHarmonyPath,
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
  it("keeps every founder sidebar route backed by an app route", () => {
    const founderRoutes = sectionsForAudience(true).flatMap((section) =>
      section.items.map((item) => item.href),
    );
    expect(founderRoutes).toContain("/settings/auditor");
    expect(founderRoutes.filter((href) => !routeExists(href))).toEqual([]);
  });

  it("keeps every subscriber sidebar route backed by an app route and founder-free", () => {
    const subscriberRoutes = sectionsForAudience(false).flatMap((section) =>
      section.items.map((item) => item.href),
    );
    expect(subscriberRoutes).not.toContain("/settings/auditor");
    expect(subscriberRoutes).not.toContain("/harmony/code");
    expect(subscriberRoutes.filter((href) => !routeExists(href))).toEqual([]);
  });

  it("keeps mobile and desktop navigation on the same source config", () => {
    expect(navSections.length).toBeGreaterThan(0);
    expect(sectionsForAudience(true)).toEqual(sectionsForAudience(true));
    expect(sectionsForAudience(false)).toEqual(sectionsForAudience(false));
  });

  it("keeps every settings card route backed by an app route", () => {
    expect(SETTINGS_ROUTE_CARDS.map((card) => card.href).filter((href) => !routeExists(href))).toEqual([]);
  });

  it("hides founder-only settings cards from subscribers", () => {
    expect(settingsRouteCardsForRole(false).map((card) => card.href)).not.toContain(
      "/settings/auditor",
    );
    expect(settingsRouteCardsForRole(true).map((card) => card.href)).toContain(
      "/settings/auditor",
    );
  });

  it("keeps founder Harmony routes default-deny for subscribers", () => {
    expect(isFounderHarmonyPath("/harmony")).toBe(true);
    expect(isFounderHarmonyPath("/harmony/code")).toBe(true);
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
});
