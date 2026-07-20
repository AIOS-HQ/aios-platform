import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CUSTOMER_EXPERIENCE_ROUTES,
  CUSTOMER_SPECIALIST_OWNERSHIP,
  SUBSCRIBER_HARMONY_ROUTES,
} from "@/lib/customer-experience/routes";
import { privacyControls } from "@/lib/customer-experience/kpis";
import { getWebsiteOperationsSnapshot, PUBLIC_WEBSITE_ROUTES } from "@/lib/website-operations/status";

const ROOT = process.cwd();

describe("Subscriber Harmony operations", () => {
  it("separates public, subscriber, and founder route matrices", () => {
    expect(SUBSCRIBER_HARMONY_ROUTES.map((route) => route.route)).toContain("/harmony/operator");
    expect(SUBSCRIBER_HARMONY_ROUTES.map((route) => route.route)).toContain("/settings/integrations");
    expect(CUSTOMER_EXPERIENCE_ROUTES.map((route) => route.route)).toContain("/harmony/customer-experience/preview");
    expect(PUBLIC_WEBSITE_ROUTES.map((route) => route.route)).toContain("/pricing");
    expect(SUBSCRIBER_HARMONY_ROUTES.every((route) => route.surface === "subscriber")).toBe(true);
    expect(CUSTOMER_EXPERIENCE_ROUTES.every((route) => route.surface === "founder")).toBe(true);
  });

  it("documents customer privacy controls and specialist ownership", () => {
    expect(privacyControls().join(" ")).toContain("Private note");
    expect(privacyControls().join(" ")).toContain("tokens");
    expect(CUSTOMER_SPECIALIST_OWNERSHIP.map((owner) => owner.agent)).toEqual([
      "Harmony",
      "Pulse",
      "Auditor",
      "Catalyst",
      "Mason",
      "Horizon",
      "Aegis",
      "Atlas",
      "Ambassador",
      "Ledger",
    ]);
  });

  it("keeps preview mode synthetic and non-impersonating", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/app/(app)/harmony/customer-experience/preview/page.tsx"),
      "utf8",
    );
    expect(source).toContain("Synthetic workspace");
    expect(source).toContain("No real customer records are read or modified");
    expect(source).toContain("does not impersonate a real customer");
  });

  it("configuration-gates website analytics instead of fabricating values", () => {
    const snapshot = getWebsiteOperationsSnapshot();
    expect(snapshot.metrics.find((metric) => metric.label === "Visitors")?.value).toMatch(/Provider configured|Configuration required/);
    expect(snapshot.metrics.find((metric) => metric.label === "Pricing CTA")?.status).toBe("not_tracked");
  });
});
