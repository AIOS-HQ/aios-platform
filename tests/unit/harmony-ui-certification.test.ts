import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { navSections } from "@/components/app/nav-config";

const ROOT = process.cwd();

function source(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Harmony production UI certification", () => {
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

  it("keeps Social inside the Harmony command navigation without duplicates", () => {
    const command = navSections.find((section) => section.titleKey === "command");
    expect(command).toBeDefined();

    const labels = command!.items.map((item) => item.labelKey);
    expect(labels).toEqual(expect.arrayContaining(["comms", "content", "social", "integrations"]));
    expect(labels.indexOf("social")).toBeGreaterThan(labels.indexOf("content"));
    expect(labels.indexOf("social")).toBeLessThan(labels.indexOf("integrations"));

    const hrefs = navSections.flatMap((section) => section.items.map((item) => item.href));
    expect(hrefs.filter((href) => href === "/harmony/social")).toHaveLength(1);
    expect(hrefs.some((href) => /harmony-social/i.test(href))).toBe(false);
  });

  it("wires profile photo uploads into persistent private profile rendering", () => {
    expect(source("supabase/migrations/20260713010000_profile_photo_path.sql")).toContain("profile_photo_path");
    expect(source("src/types/database.ts")).toContain("profile_photo_path: string | null");
    expect(source("src/app/(app)/settings/branding/upload-action.ts")).toContain("profile_photo_path: path");
    expect(source("src/app/(app)/layout.tsx")).toContain("profilePhotoUrl");
    expect(source("src/components/app/user-menu.tsx")).toContain("AvatarImage");
  });
});
