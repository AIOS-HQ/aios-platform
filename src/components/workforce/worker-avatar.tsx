import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { AGENT_ICONS, JULIUS_ICON } from "@/lib/workforce/agent-icons";
import type { AiosAgentKey } from "@/lib/workforce/registry";

/**
 * WorkerAvatar — the official AIOS AI-worker identity mark.
 *
 * A colored gradient "squircle" tile with a glossy edge and the worker's dark
 * domain line-glyph centered on it — one distinct gradient per worker (and
 * Julius, the Company Brain). This is the single, consistent avatar rendered
 * wherever a worker appears (Workforce, Julius, profiles, activity, chat,
 * Command Center, Integration Center). The glyph set (AGENT_ICONS) and the
 * roster (AIOS_WORKFORCE) stay canonical; this standardizes the visual mark.
 *
 * The gradient is applied via inline `style` so it always renders correctly even
 * when a caller passes a `bg-*` utility class. Pure + client-safe + no binary
 * assets — crisp at every size.
 */

export type WorkerAvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

/** Tile dimensions + corner radius per size — uniform across the app. */
const CHIP: Record<WorkerAvatarSize, string> = {
  xs: "size-7 rounded-lg",
  sm: "size-9 rounded-lg",
  md: "size-10 rounded-xl",
  lg: "size-12 rounded-xl",
  xl: "size-16 rounded-2xl",
};
const ICON: Record<WorkerAvatarSize, string> = {
  xs: "size-4",
  sm: "size-[18px]",
  md: "size-5",
  lg: "size-6",
  xl: "size-8",
};

/** Diagonal gradient [from, to] per worker. Hex so the inline style is authoritative. */
const GRADIENTS: Record<string, [string, string]> = {
  harmony: ["#6366f1", "#8b5cf6"], // indigo → violet (orchestration)
  julius: ["#14b8a6", "#10b981"], // teal → emerald (company brain)
  auditor: ["#0ea5e9", "#06b6d4"], // sky → cyan (audit / verify)
  mason: ["#8b5cf6", "#d946ef"], // violet → fuchsia (engineering)
  catalyst: ["#ec4899", "#f43f5e"], // pink → rose (growth)
  ambassador: ["#3b82f6", "#6366f1"], // blue → indigo (communications)
  atlas: ["#10b981", "#14b8a6"], // emerald → teal (knowledge)
  pulse: ["#06b6d4", "#0ea5e9"], // cyan → sky (monitoring)
  horizon: ["#d946ef", "#a855f7"], // fuchsia → purple (strategy)
  aegis: ["#2563eb", "#64748b"], // blue → slate (security)
  ledger: ["#f59e0b", "#f97316"], // amber → orange (records)
};

/** Deterministic gradient for any worker without an explicit mapping. */
function gradientFor(key: string): [string, string] {
  const mapped = GRADIENTS[key];
  if (mapped) return mapped;
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) % 360;
  return [`hsl(${h} 72% 56%)`, `hsl(${(h + 40) % 360} 70% 46%)`];
}

export interface WorkerAvatarProps {
  /** Agent key (harmony, atlas, …) or "julius". */
  agent: string;
  size?: WorkerAvatarSize;
  className?: string;
  /** Accessible label; when omitted the mark is decorative (aria-hidden). */
  title?: string;
}

export function WorkerAvatar({ agent, size = "md", className, title }: WorkerAvatarProps) {
  const Icon = agent === "julius" ? JULIUS_ICON : AGENT_ICONS[agent as AiosAgentKey];
  if (!Icon) return null;

  const [from, to] = gradientFor(agent);
  const style: CSSProperties = { backgroundImage: `linear-gradient(135deg, ${from} 0%, ${to} 100%)` };

  return (
    <span
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={style}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden",
        "shadow-sm ring-1 ring-inset ring-white/20",
        CHIP[size],
        className,
      )}
    >
      {/* Top gloss highlight — matches the reference tiles. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent"
      />
      <Icon className={cn("relative text-slate-950/85", ICON[size])} strokeWidth={2} aria-hidden="true" />
    </span>
  );
}
