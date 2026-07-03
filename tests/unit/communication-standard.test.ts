import { describe, expect, it } from "vitest";
import {
  buildAiosCommunicationPrompt,
  executiveCompletionReport,
  formatConversationContext,
  formatLongFounderPrompt,
  responseModeFor,
} from "@/lib/communication/standard";

describe("AIOS communication standard", () => {
  it("adapts response mode to founder intent", () => {
    expect(responseModeFor("continue")).toBe("brief");
    expect(responseModeFor("How should we explain this to investors?")).toBe("investor");
    expect(responseModeFor("Review the Supabase architecture")).toBe("technical");
    expect(responseModeFor("What should we prioritize this week?")).toBe("executive");
  });

  it("adds executive guidance to Harmony prompts", () => {
    const prompt = buildAiosCommunicationPrompt({
      locale: "en",
      agentName: "Harmony",
      input: "Give me the launch summary",
    });

    expect(prompt).toContain("executive Chief of Staff");
    expect(prompt).toContain("Hide internal details");
  });

  it("uses natural Spanish guidance", () => {
    const prompt = buildAiosCommunicationPrompt({
      locale: "es",
      agentName: "Harmony",
      input: "Explica esto para inversionistas",
    });

    expect(prompt).toContain("Jefe de Gabinete ejecutivo");
    expect(prompt).toContain("español empresarial natural");
  });

  it("formats long founder prompts as one continuous brief", () => {
    const prompt = formatLongFounderPrompt("x".repeat(8000));

    expect(prompt).toContain("long brief");
    expect(prompt).toContain("Segment 1/3");
    expect(prompt).toContain("Segment 3/3");
  });

  it("formats recent conversation context", () => {
    const context = formatConversationContext([
      { role: "user", text: "Review this" },
      { role: "assistant", text: "I reviewed it." },
    ]);

    expect(context).toContain("Founder: Review this");
    expect(context).toContain("Harmony: I reviewed it.");
  });

  it("creates bilingual executive reports", () => {
    const en = executiveCompletionReport({
      locale: "en",
      completedWork: "Reviewed the launch checklist.",
      businessImpact: "The founder can see what remains before launch.",
      nextStep: "Verify production credentials.",
    });
    const es = executiveCompletionReport({
      locale: "es",
      completedWork: "Revise la lista de lanzamiento.",
      businessImpact: "El fundador puede ver lo que falta antes del lanzamiento.",
      nextStep: "Verificar credenciales de produccion.",
    });

    expect(en).toContain("Executive Summary");
    expect(es).toContain("Resumen ejecutivo");
  });
});
