import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";

/** The public AIOS platform glyph. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-7", className)}
      role="img"
      aria-label={`${APP_NAME} logo`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="32" height="32" rx="8" fill="#041432" />
      <circle
        cx="16"
        cy="16"
        r="11"
        stroke="#2D8CFF"
        strokeWidth="2.5"
        fill="none"
      />
      <circle cx="16" cy="5" r="1.5" fill="#2D8CFF" />
      <circle cx="27" cy="16" r="1.5" fill="#2D8CFF" />
      <circle cx="16" cy="27" r="1.5" fill="#2D8CFF" />
      <circle cx="5" cy="16" r="1.5" fill="#2D8CFF" />
      <path
        d="M11 8V24M21 8V24M11 16H21"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="2.5" fill="#2D8CFF" />
    </svg>
  );
}

/** Full public AIOS lockup: glyph + wordmark. */
export function Logo({
  className,
  showWordmark = true,
  markClassName,
}: {
  className?: string;
  showWordmark?: boolean;
  markClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className={markClassName} />
      {showWordmark && (
        <span className="text-lg font-semibold tracking-tight">{APP_NAME}</span>
      )}
    </span>
  );
}

/** The official Founder-approved Harmony mark for authenticated product chrome. */
export function HarmonyOfficialMark({ className }: { className?: string }) {
  return (
    <img
      src="/branding/harmony-official-mark.svg"
      alt="Harmony"
      className={cn("size-9 shrink-0 rounded-xl object-contain", className)}
      data-harmony-product-mark="true"
    />
  );
}

/**
 * Official Harmony lockup for the authenticated operating system.
 *
 * The public marketing website remains AIOS-branded. Authenticated product
 * chrome uses the Founder-approved Harmony mark stored at
 * /public/branding/harmony-official-mark.svg and exactly one product identity.
 *
 * The export name is retained for compatibility with existing imports.
 */
export function AiosHarmonyLogo({
  className,
  compact = false,
  inverse = false,
  aiosMarkClassName,
}: {
  className?: string;
  compact?: boolean;
  inverse?: boolean;
  aiosMarkClassName?: string;
  /** @deprecated Retained for call-site compatibility only. */
  harmonyMarkClassName?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-2.5 align-middle leading-none",
        inverse && "text-white",
        className,
      )}
      data-harmony-product-lockup="true"
    >
      <HarmonyOfficialMark className={aiosMarkClassName} />
      {!compact && (
        <span className="flex min-w-0 flex-col justify-center gap-0.5">
          <span className="truncate text-sm font-semibold tracking-tight sm:text-base">
            Harmony
          </span>
          <span
            className={cn(
              "truncate text-xs font-medium text-muted-foreground",
              inverse && "text-slate-300",
            )}
          >
            Company operating system
          </span>
        </span>
      )}
    </span>
  );
}
