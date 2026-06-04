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
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <circle
        cx="16"
        cy="16"
        r="7.5"
        className="stroke-primary-foreground"
        strokeWidth="2"
        fill="none"
        opacity="0.65"
      />
      <circle cx="16" cy="16" r="2.75" className="fill-primary-foreground" />
      <circle cx="24.5" cy="9" r="2.25" className="fill-primary-foreground" />
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
