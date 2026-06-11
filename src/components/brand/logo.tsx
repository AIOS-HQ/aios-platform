import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";

/** The AIOS glyph: a rounded badge with an intelligent "core" ring + node. */
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

<circle
  cx="16"
  cy="16"
  r="2.5"
  fill="#2D8CFF"
/>
    </svg>
  );
}

/** Full lockup: glyph + wordmark. */
export function Logo({
  className,
  showWordmark = true,
}: {
  className?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      {showWordmark && (
        <span className="text-lg font-semibold tracking-tight">{APP_NAME}</span>
      )}
    </span>
  );
}
