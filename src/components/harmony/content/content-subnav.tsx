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
    <nav className="mb-6 flex gap-1 border-b" aria-label="Content sections">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === active ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition",
            tab.key === active
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t(tab.key)}
        </Link>
      ))}
    </nav>
  );
}
