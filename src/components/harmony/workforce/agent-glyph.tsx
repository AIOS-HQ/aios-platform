import { cn } from "@/lib/utils";
import { AGENT_ICONS, JULIUS_ICON } from "@/lib/workforce/agent-icons";
import type { AiosAgentKey } from "@/lib/workforce/registry";

export type AgentGlyphSize = "xs" | "sm" | "md" | "lg" | "xl";

/** Chip dimensions + corner radius per size — uniform across the app. */
const CHIP: Record<AgentGlyphSize, string> = {
  xs: "size-7 rounded-lg",
  sm: "size-9 rounded-lg",
  md: "size-10 rounded-xl",
  lg: "size-12 rounded-xl",
  xl: "size-16 rounded-2xl",
};
const ICON: Record<AgentGlyphSize, string> = {
  xs: "size-3.5",
  sm: "size-[18px]",
  md: "size-5",
  lg: "size-6",
  xl: "size-7",
};

/**
 * Canonical AI Workforce glyph — the single, consistent way to render any AIOS
 * agent (or Julius, the Company Brain) wherever they appear. A domain line-icon
 * on a bordered, rounded "chip" with uniform sizing, stroke width, corner
 * radius, and muted fill — identical across the Founder, Business, and Customer
 * experiences. The icon set (AGENT_ICONS) stays canonical; this standardizes
 * the visual treatment around it so every agent looks consistent.
 */
export function AgentGlyph({
  agent,
  size = "md",
  className,
  title,
}: {
  agent: string;
  size?: AgentGlyphSize;
  className?: string;
  title?: string;
}) {
  const Icon = agent === "julius" ? JULIUS_ICON : AGENT_ICONS[agent as AiosAgentKey];
  if (!Icon) return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center border bg-muted text-foreground",
        CHIP[size],
        className,
      )}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <Icon className={ICON[size]} strokeWidth={1.75} aria-hidden="true" />
    </span>
  );
}
