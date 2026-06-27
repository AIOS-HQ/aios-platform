import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";

type Tab = "hub" | "calendar" | "analytics";

const TABS: { key: Tab; href: string }[] = [
  { key: "hub", href: "/harmony/content" },
  { key: "calendar", href: "/harmony/content/calendar" },
  { key: "analytics", href: "/harmony/content/analytics" },
];

/** Tab bar shared across the Content hub, calendar, and analytics pages. */
export async function ContentSubnav({ active }: { active: Tab }) {
  const t = await getTranslations("os.content.tabs");
  return (
    <nav className="mb-6 overflow-x-auto" aria-label="Content sections">
      <div className="inline-flex min-w-full gap-1 rounded-xl border bg-card p-1 shadow-soft sm:min-w-0">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={tab.key === active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              tab.key === active &&
                "bg-primary text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground",
            )}
          >
            {t(tab.key)}
          </Link>
        ))}
      </div>
    </nav>
  );
}
