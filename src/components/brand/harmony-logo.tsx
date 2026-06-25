import Image from "next/image";
import { cn } from "@/lib/utils";
import { HARMONY_LOGO_SRC } from "./harmony-logo-asset";

/**
 * Harmony brand mark — the official Harmony logo (v2).
 *
 * The single canonical Harmony brand asset (an optimized inline image of the
 * approved logo; see ./harmony-logo-asset). Used everywhere branding is shown —
 * landing, hero, footer, auth, the app header for every portal, marketing.
 * Square badge; size it via `className` (defaults to size-8). Decorative by
 * default; pass a `title` for an accessible name when used standalone.
 *
 * This is the BRAND mark. For Harmony's INTERACTION identity inside
 * conversations, use {@link HarmonyAvatar} — never the brand logo in chat.
 */
export function HarmonyMark({
  className,
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <Image
      src={HARMONY_LOGO_SRC}
      alt={title ?? ""}
      width={64}
      height={64}
      unoptimized
      draggable={false}
      aria-hidden={title ? undefined : true}
      className={cn("size-8 shrink-0 select-none rounded-[22%]", className)}
    />
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
 * from {@link HarmonyMark} (the brand logo); never use the brand logo inside a
 * conversation.
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
 * Full Harmony lockup: the official logo mark + wordmark. Used in the marketing
 * header/footer, the app header, and auth. The wordmark hue inherits the current
 * text color so it adapts to the surrounding surface; pass `showWordmark={false}`
 * for the icon-only canonical logo.
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
