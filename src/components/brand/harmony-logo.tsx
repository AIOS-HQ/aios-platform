import { cn } from "@/lib/utils";

/**
 * Harmony brand mark — the orbital "H".
 *
 * A vector reproduction of the approved Harmony logo: two silver pillars (the
 * "H") bound by an electric-blue orbital ring with four nodes and a glowing
 * core. Pure SVG so it stays razor-sharp at every size and themeable via the
 * surrounding brand canvas. Decorative by default; pass a `title` for an
 * accessible name when used standalone.
 *
 * This is a BRAND mark (used in the wordmark lockup, marketing, hero). For
 * Harmony's INTERACTION identity inside conversations, use {@link HarmonyAvatar}.
 */
export function HarmonyMark({
  className,
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("size-8", className)}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="harmonyRing" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7cc4ff" />
          <stop offset="1" stopColor="#2f6bff" />
        </linearGradient>
        <linearGradient id="harmonyPillars" x1="22" y1="16" x2="42" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#cdddf2" />
        </linearGradient>
        <radialGradient id="harmonyCore" cx="32" cy="32" r="8" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#d6ecff" />
          <stop offset="0.55" stopColor="#43a0ff" />
          <stop offset="1" stopColor="#2f6bff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* orbital ring */}
      <circle cx="32" cy="32" r="23" fill="none" stroke="url(#harmonyRing)" strokeWidth="2.25" opacity="0.9" />

      {/* cardinal nodes */}
      <circle cx="32" cy="9" r="3.1" fill="#7cc4ff" />
      <circle cx="55" cy="32" r="3.1" fill="#3f8bff" />
      <circle cx="32" cy="55" r="3.1" fill="#2f6bff" />
      <circle cx="9" cy="32" r="3.1" fill="#5aa6ff" />

      {/* the "H" pillars */}
      <rect x="20.5" y="18" width="4.8" height="28" rx="2.4" fill="url(#harmonyPillars)" />
      <rect x="38.7" y="18" width="4.8" height="28" rx="2.4" fill="url(#harmonyPillars)" />

      {/* glowing core (the crossbar hub) */}
      <circle cx="32" cy="32" r="9" fill="url(#harmonyCore)" />
      <circle cx="32" cy="32" r="3.4" fill="#eaf5ff" />
    </svg>
  );
}

/**
 * Harmony chat avatar — the canonical INTERACTION identity.
 *
 * A circular, high-contrast take on the Harmony mark, tuned for small sizes
 * (20–40px): a solid electric-blue → deep-navy disc, a subtle orbital ring (the
 * Harmony signature), and a crisp white "H" that reads instantly. Use this
 * anywhere Harmony is actively interacting with the user — beside every reply,
 * while thinking or streaming, throughout conversation history, on Ask Harmony
 * cards, and in Harmony-generated notifications. It is deliberately distinct
 * from {@link HarmonyMark} (the brand mark) and from {@link HarmonyLogo} (the
 * wordmark); never use the wordmark inside a conversation.
 *
 * Same API as HarmonyMark so it is a drop-in: size it via `className`
 * (e.g. `size-6`), pass a `title` for an accessible name when standalone.
 */
export function HarmonyAvatar({
  className,
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("size-8", className)}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="harmonyAvatarBg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1e3a8a" />
        </linearGradient>
        <radialGradient id="harmonyAvatarGloss" cx="32" cy="18" r="34" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.30" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* high-contrast brand disc + soft top gloss for a premium finish */}
      <circle cx="32" cy="32" r="32" fill="url(#harmonyAvatarBg)" />
      <circle cx="32" cy="32" r="32" fill="url(#harmonyAvatarGloss)" />

      {/* subtle orbital ring — kept light so the "H" stays dominant at small sizes */}
      <circle cx="32" cy="32" r="22" fill="none" stroke="#bfdbfe" strokeWidth="2" opacity="0.55" />

      {/* bold white "H" — instantly recognizable down to ~20px */}
      <rect x="20" y="18" width="6.5" height="28" rx="3.25" fill="#ffffff" />
      <rect x="37.5" y="18" width="6.5" height="28" rx="3.25" fill="#ffffff" />
      <rect x="20" y="28.75" width="24" height="6.5" rx="3.25" fill="#ffffff" />
    </svg>
  );
}

/**
 * Full Harmony lockup: orbital mark + wordmark. Used in the marketing header
 * and footer. Wordmark hue inherits the current text color so it adapts to the
 * surrounding surface.
 */
export function HarmonyLogo({
  className,
  showWordmark = true,
  markClassName,
}: {
  className?: string;
  showWordmark?: boolean;
  markClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <HarmonyMark className={cn("size-8", markClassName)} title="Harmony" />
      {showWordmark && (
        <span className="text-lg font-semibold tracking-tight">Harmony</span>
      )}
    </span>
  );
}
