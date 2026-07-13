import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AiosHarmonyLogo } from "@/components/brand/logo";
import { flattenNavItems, sectionsForAudience } from "@/components/app/nav-config";

const ROOT = process.cwd();

function source(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Harmony production UI certification", () => {
  it("renders the canonical AIOS + Harmony lockup with exactly one visual mark", () => {
    const html = renderToStaticMarkup(createElement(AiosHarmonyLogo));
    expect(html.match(/data-aios-product-mark="true"/g)).toHaveLength(1);
    expect(html).toContain("AIOS");
    expect(html).toContain("Harmony");
    expect(html).not.toContain("Harmony logo");
  });

  it("keeps authenticated page headers free of duplicate Harmony branding", () => {
    const guarded = [
      "src/components/shared/page-header.tsx",
      "src/components/shared/loaders.tsx",
    ];

    for (const rel of guarded) {
      const text = source(rel);
      expect(text).not.toContain("AiosHarmonyLogo");
      expect(text).not.toContain("HarmonyMark");
      expect(text).not.toContain("HarmonyLogo");
    }
  });

  it("keeps Social nested under Harmony primary navigation without duplicates", () => {
    const primary = sectionsForAudience(true).find((section) => section.titleKey === "primary");
    const command = sectionsForAudience(true).find((section) => section.titleKey === "command");
    expect(primary).toBeDefined();
    expect(command).toBeDefined();

    const harmony = primary!.items.find((item) => item.labelKey === "operator");
    expect(harmony?.children?.map((item) => item.labelKey)).toEqual(["social"]);
    expect(command!.items.map((item) => item.labelKey)).not.toContain("social");

    const hrefs = flattenNavItems(sectionsForAudience(true)).map((item) => item.href);
    expect(hrefs.filter((href) => href === "/harmony/social")).toHaveLength(1);
    expect(hrefs.some((href) => /harmony-social/i.test(href))).toBe(false);
    expect(flattenNavItems(sectionsForAudience(false)).map((item) => item.href)).not.toContain("/harmony/social");
  });

  it("wires profile photo uploads into persistent private profile rendering", () => {
    expect(source("supabase/migrations/20260713010000_profile_photo_path.sql")).toContain("profile_photo_path");
    expect(source("src/types/database.ts")).toContain("profile_photo_path: string | null");
    expect(source("src/app/(app)/settings/branding/upload-action.ts")).toContain("profile_photo_path: path");
    expect(source("src/app/(app)/settings/branding/upload-action.ts")).toContain("removeProfilePhoto");
    expect(source("src/lib/uploads/validation.ts")).toContain("PROFILE_PHOTO_MAX_BYTES");
    expect(source("src/app/(app)/layout.tsx")).toContain("profilePhotoUrl");
    expect(source("src/components/app/user-menu.tsx")).toContain("AvatarImage");
  });
});
