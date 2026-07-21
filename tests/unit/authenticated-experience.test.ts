import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("authenticated executive experience", () => {
  it("keeps customer and Founder feeds explicitly separated", () => {
    const customer = source("src/app/(app)/harmony/personal/page.tsx");
    const founder = source("src/app/(app)/harmony/page.tsx");

    expect(customer).toContain('audience="customer"');
    expect(customer).not.toContain('audience="founder"');
    expect(customer).not.toContain("pendingApprovals");
    expect(customer).not.toContain("Mason");

    expect(founder).toContain('audience="founder"');
    expect(founder).not.toContain('audience="customer"');
  });

  it("reuses one shared feed implementation across auth and app surfaces", () => {
    const shared = source("src/components/harmony/harmony-live-feed.tsx");
    const authExport = source("src/components/auth/harmony-live-feed.tsx");

    expect(shared).toContain('variant?: "entrance" | "authenticated"');
    expect(shared).toContain("data-audience={audience}");
    expect(authExport).toContain(
      '@/components/harmony/harmony-live-feed',
    );
  });

  it("keeps authenticated failures recoverable inside the shared shell", () => {
    expect(
      fs.existsSync(path.join(ROOT, "src/app/(app)/error.tsx")),
    ).toBe(true);
    const boundary = source("src/components/app/route-error.tsx");
    expect(boundary).toContain('role="alert"');
    expect(boundary).toContain("reset");
  });

  it("supports deliberate light and dark executive themes without changing preference logic", () => {
    const shell = source("src/components/app/app-shell.tsx");
    const css = source("src/app/globals.css");
    const themeScript = source("src/components/theme-script.tsx");

    expect(shell).toContain("app-executive");
    expect(shell).toContain("data-audience");
    expect(css).toContain(".app-executive {");
    expect(css).toContain(".dark .app-executive {");
    expect(themeScript).toContain("aios-theme");
    expect(themeScript).toContain("prefers-color-scheme: dark");
  });
});
