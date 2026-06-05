import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  aiLimits,
  clampPrompt,
  shouldRetry,
  backoffDelayMs,
} from "@/lib/ai/limits";
import {
  recordProviderCall,
  getProviderHealth,
  resetProviderHealth,
} from "@/lib/ai/health";

describe("ai limits (cost + reliability safeguards)", () => {
  it("clamps a prompt to the max length", () => {
    expect(clampPrompt("hello", 10)).toBe("hello");
    expect(clampPrompt("hello world", 5)).toBe("hello");
    expect(clampPrompt("x", 0)).toBe("");
  });

  it("retries only on 429 and 5xx", () => {
    expect(shouldRetry(429)).toBe(true);
    expect(shouldRetry(500)).toBe(true);
    expect(shouldRetry(503)).toBe(true);
    expect(shouldRetry(400)).toBe(false);
    expect(shouldRetry(401)).toBe(false);
    expect(shouldRetry(404)).toBe(false);
    expect(shouldRetry(200)).toBe(false);
  });

  it("backs off exponentially with a cap", () => {
    expect(backoffDelayMs(0)).toBe(300);
    expect(backoffDelayMs(1)).toBe(600);
    expect(backoffDelayMs(2)).toBe(1200);
    expect(backoffDelayMs(10)).toBe(5000); // capped
  });

  it("uses clamped defaults and honors env overrides", () => {
    const before = process.env.AI_TIMEOUT_MS;
    delete process.env.AI_TIMEOUT_MS;
    expect(aiLimits().timeoutMs).toBe(30000);
    expect(aiLimits().maxRetries).toBe(2);
    expect(aiLimits().maxOutputTokens).toBe(1024);

    process.env.AI_TIMEOUT_MS = "999999"; // above max → clamped to 120000
    expect(aiLimits().timeoutMs).toBe(120000);
    if (before === undefined) delete process.env.AI_TIMEOUT_MS;
    else process.env.AI_TIMEOUT_MS = before;
  });
});

describe("provider health monitoring", () => {
  beforeEach(() => resetProviderHealth());
  afterEach(() => resetProviderHealth());

  it("starts empty", () => {
    const h = getProviderHealth();
    expect(h.last).toBeNull();
    expect(h.consecutiveFailures).toBe(0);
    expect(h.degraded).toBe(false);
  });

  it("flags degraded after 3 consecutive failures and recovers on success", () => {
    recordProviderCall({ provider: "openai", ok: false, latencyMs: 10, error: "boom" });
    recordProviderCall({ provider: "openai", ok: false, latencyMs: 10, error: "boom" });
    expect(getProviderHealth().degraded).toBe(false);
    recordProviderCall({ provider: "openai", ok: false, latencyMs: 10, error: "boom" });
    expect(getProviderHealth().degraded).toBe(true);
    expect(getProviderHealth().consecutiveFailures).toBe(3);

    recordProviderCall({ provider: "openai", ok: true, latencyMs: 12 });
    const h = getProviderHealth();
    expect(h.degraded).toBe(false);
    expect(h.consecutiveFailures).toBe(0);
    expect(h.last?.ok).toBe(true);
  });
});
