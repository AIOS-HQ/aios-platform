import type { CSSProperties } from "react";

/**
 * WorkerAvatar (Foundation P6) — the official AI-worker identity mark.
 *
 * Replaces every placeholder "H" with a distinct, brandable monogram per worker:
 * a deterministic gradient keyed to the agent, plus its initial. Pure + client-
 * safe + no binary assets, so it renders everywhere (Directory, chat, dashboards)
 * with a consistent identity. Illustrated portrait avatars can later be layered
 * in behind the same component API (add an optional `src`).
 *
 * Gradient class strings are literal (Tailwind-scannable); size classes literal.
 */

export type WorkerAvatarSize = "sm" | "md" | "lg" | "xl";

const GRADIENTS: Record<string, string> = {
  harmony: "from-indigo-500 to-violet-500",
  julius: "from-teal-500 to-emerald-500",
  ledger: "from-amber-500 to-orange-500",
  mason: "from-violet-500 to-fuchsia-500",
  auditor: "from-sky-500 to-cyan-500",
  catalyst: "from-pink-500 to-rose-500",
  ambassador: "from-blue-500 to-indigo-500",
  atlas: "from-emerald-500 to-teal-500",
  pulse: "from-cyan-500 to-sky-500",
  horizon: "from-fuchsia-500 to-purple-500",
  aegis: "from-blue-600 to-slate-500",
};

const SIZES: Record<WorkerAvatarSize, string> = {
  sm: "size-8 text-xs",
  md: "size-11 text-base",
  lg: "size-14 text-lg",
  xl: "size-20 text-2xl",
};

/** Deterministic fallback hue for workers without a mapped gradient. */
function fallbackStyle(key: string): CSSProperties {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) % 360;
  return { backgroundImage: `linear-gradient(135deg, hsl(${h} 70% 55%), hsl(${(h + 40) % 360} 70% 45%))` };
}

export interface WorkerAvatarProps {
  agentKey: string;
  name: string;
  size?: WorkerAvatarSize;
  /** Optional illustrated portrait; falls back to the monogram when absent. */
  src?: string;
  className?: string;
}

export function WorkerAvatar({ agentKey, name, size = "md", src, className }: WorkerAvatarProps) {
  const grad = GRADIENTS[agentKey];
  const initial = (name || agentKey).charAt(0).toUpperCase();
  const base = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl font-bold text-white ${SIZES[size]} ${className ?? ""}`;

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={`${name} avatar`} className={`${base} object-cover`} />
    );
  }
  if (grad) {
    return (
      <span aria-label={`${name} avatar`} role="img" className={`${base} bg-gradient-to-br ${grad}`}>
        {initial}
      </span>
    );
  }
  return (
    <span aria-label={`${name} avatar`} role="img" className={base} style={fallbackStyle(agentKey)}>
      {initial}
    </span>
  );
}
