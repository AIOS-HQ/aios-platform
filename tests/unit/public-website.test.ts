import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PUBLIC_NAV_LINKS } from "@/components/marketing/public-navbar";

const ROOT = process.cwd();

function routeExists(href: string): boolean {
  if (href.startsWith("/#")) return true;
  const clean = href.split("#")[0].split("?")[0];
  const rel = clean === "/" ? "" : clean.slice(1);
  return [
    path.join(ROOT, "src/app", rel, "page.tsx"),
    path.join(ROOT, "src/app/(marketing)", rel, "page.tsx"),
    path.join(ROOT, "src/app/(auth)", rel, "page.tsx"),
  ].some(fs.existsSync);
}

describe("public website certification", () => {
  it("keeps public navigation intentional and resolvable", () => {
    expect(PUBLIC_NAV_LINKS.map((link) => link.label)).toEqual([
      "Features",
      "AI Workforce",
      "How It Works",
      "Integrations",
      "Company Templates",
      "Marketplace",
      "Pricing",
      "Docs",
    ]);
    expect(PUBLIC_NAV_LINKS.map((link) => link.href).filter((href) => !routeExists(href))).toEqual([]);
  });

  it("keeps protected app routes out of the public sitemap and robots allow-list", () => {
    const sitemap = fs.readFileSync(path.join(ROOT, "src/app/sitemap.ts"), "utf8");
    const robots = fs.readFileSync(path.join(ROOT, "src/app/robots.ts"), "utf8");

    expect(sitemap).not.toContain('"/harmony"');
    expect(sitemap).not.toContain('"/settings"');
    expect(robots).toContain('disallow: ["/harmony", "/settings", "/api"]');
  });

  it("keeps the public homepage free of duplicate standalone Harmony marks", () => {
    const homepage = fs.readFileSync(path.join(ROOT, "src/app/page.tsx"), "utf8");

    expect(homepage).not.toContain("HarmonyMark");
    expect(homepage).not.toContain("HarmonyLogo");
  });

  it("documents the production public route matrix", () => {
    const doc = fs.readFileSync(path.join(ROOT, "docs/PUBLIC_WEBSITE.md"), "utf8");
    for (const route of ["/", "/features", "/ai-workforce", "/templates", "/marketplace", "/docs", "/pricing"]) {
      expect(doc).toContain(`| \`${route}\``);
    }
    expect(doc).toContain("No fake customer counts");
  });
});
