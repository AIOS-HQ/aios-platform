import {
  Workflow,
  ClipboardCheck,
  TrendingUp,
  Megaphone,
  BookOpen,
  Activity,
  Telescope,
  Shield,
  Receipt,
  BrainCircuit,
  type LucideIcon,
} from "lucide-react";
import type { AiosAgentKey } from "@/lib/workforce/registry";

/**
 * AIOS Workforce Icon System.
 *
 * One compact, professional line icon per workforce member (and Julius, the
 * Company Brain). Reusable across Workforce, Chat, Activity, Operations,
 * Approvals, and the Relationship Graph. Deliberately NOT avatars / portraits /
 * robot characters — these are domain glyphs sized like any other UI icon.
 */
export const AGENT_ICONS: Record<AiosAgentKey, LucideIcon> = {
  harmony: Workflow, // orchestration
  auditor: ClipboardCheck, // audit / verification
  catalyst: TrendingUp, // growth / marketing
  ambassador: Megaphone, // communications
  atlas: BookOpen, // knowledge
  pulse: Activity, // monitoring
  horizon: Telescope, // strategy / forecasting
  aegis: Shield, // security
  ledger: Receipt, // finance / records
};

/** Julius — the AIOS Company Brain (not a workforce agent). */
export const JULIUS_ICON: LucideIcon = BrainCircuit;

export function getAgentIcon(key: string): LucideIcon | null {
  return (AGENT_ICONS as Record<string, LucideIcon>)[key] ?? null;
}
