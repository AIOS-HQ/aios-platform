import Image from "next/image";
import { cn } from "@/lib/utils";
import { getHarmonyLogoSrc } from "./harmony-logo-asset";

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
  locale,
  title,
}: {
  className?: string;
  locale?: string;
  title?: string;
}) {
  return (
    <Image
      src={getHarmonyLogoSrc(locale)}
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
 * The colored Harmony worker avatar: an indigo→violet gradient squircle with a
 * glossy edge and Harmony's domain glyph (orchestration / interlocking
 * workflow), matching the platform-wide WorkerAvatar system so Harmony looks
 * identical everywhere she interacts — beside every reply, while thinking or
 * streaming, throughout conversation history, on Ask Harmony cards, and in
 * Harmony-generated notifications. Deliberately distinct from {@link HarmonyMark}
 * (the brand logo); never use the brand logo inside a conversation.
 *
 * Same API as before so it is a drop-in: size it via `className` (e.g. `size-6`),
 * pass a `title` for an accessible name when standalone. Rendered as a scalable
 * SVG so it stays crisp from ~14px chat marks up to hero sizes.
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
      className={cn("size-8 shrink-0", className)}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="harmonyAvBg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
        <linearGradient id="harmonyAvGloss" x1="0" y1="0" x2="0" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.30" />
          <stop offset="0.55" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Gradient squircle tile + soft top gloss + crisp inset edge. */}
      <rect x="0" y="0" width="64" height="64" rx="18" fill="url(#harmonyAvBg)" />
      <rect x="0" y="0" width="64" height="64" rx="18" fill="url(#harmonyAvGloss)" />
      <rect x="1" y="1" width="62" height="62" rx="17" fill="none" stroke="#ffffff" strokeOpacity="0.25" strokeWidth="1.5" />

      {/* Harmony domain glyph — orchestration / interlocking workflow. */}
      <svg
        x="15"
        y="15"
        width="34"
        height="34"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#0f172a"
        strokeOpacity="0.85"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect width="8" height="8" x="3" y="3" rx="2" />
        <path d="M7 11v4a2 2 0 0 0 2 2h4" />
        <rect width="8" height="8" x="13" y="13" rx="2" />
      </svg>
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
  locale,
  markClassName,
}: {
  className?: string;
  showWordmark?: boolean;
  locale?: string;
  markClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <HarmonyMark className={cn("size-7 sm:size-8", markClassName)} locale={locale} title="Harmony" />
      {showWordmark && (
        <span className="text-base font-semibold leading-none sm:text-lg">Harmony</span>
      )}
    </span>
  );
}
