import Link from "next/link";
import { useTranslations } from "next-intl";
import { HarmonyMark } from "@/components/brand/harmony-logo";

type FooterLink = { label: string; href: string };
type FooterData = {
  tagline: string;
  note: string;
  rights: string;
  columns: { title: string; links: FooterLink[] }[];
};

/** Shared marketing footer, sourced from the localized `landing.footer` copy. */
export function SiteFooter() {
  const t = useTranslations("landing");
  const footer = t.raw("footer") as FooterData;

  return (
    <footer className="border-t border-white/10 bg-[#060912]">
      <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="flex flex-col gap-4">
            <HarmonyMark className="size-11" title="Harmony" />
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              {footer.tagline}
            </p>
          </div>
          {footer.columns.map((col) => (
            <div key={col.title} className="flex flex-col gap-3">
              <p className="text-sm font-semibold text-foreground">{col.title}</p>
              <ul className="flex flex-col gap-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-white/10 pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl">{footer.note}</p>
          <p>
            © {new Date().getFullYear()} AIOS. {footer.rights}
          </p>
        </div>
      </div>
    </footer>
  );
}
