import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  CheckCircle2,
  Globe,
  HeartHandshake,
  Lock,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const principleIcons = {
  humanControl: HeartHandshake,
  trust: ShieldCheck,
  global: Globe,
  accessibility: Sparkles,
  ownData: Lock,
} as const;

export default function LandingPage() {
  const t = useTranslations("landing");
  const tc = useTranslations("common");

  const principleKeys = [
    "humanControl",
    "trust",
    "global",
    "accessibility",
    "ownData",
  ] as const;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <nav
          className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6"
          aria-label="Primary"
        >
          <Logo />
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="hidden sm:block">
              <LocaleSwitcher />
            </div>
            <ThemeToggle />
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link href="/login">{tc("logIn")}</Link>
            </Button>
            <Button asChild>
              <Link href="/signup">{tc("getStarted")}</Link>
            </Button>
          </div>
        </nav>
      </header>

      <main id="main-content" className="flex-1">
        {/* Hero */}
        <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="secondary" className="mb-5 gap-1.5">
              <Sparkles className="size-3.5" aria-hidden="true" />
              {t("hero.badge")}
            </Badge>
            <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-6xl">
              {t("hero.title")}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-muted-foreground">
              {t("hero.subtitle")}
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href="/signup">
                  {t("hero.ctaPrimary")}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="w-full sm:w-auto"
              >
                <Link href="/login">{t("hero.ctaSecondary")}</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Products */}
        <section className="border-t bg-muted/30">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight">
                {t("products.title")}
              </h2>
              <p className="mt-3 text-muted-foreground">
                {t("products.subtitle")}
              </p>
            </div>
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              <Card className="flex flex-col">
                <CardHeader>
                  <div className="mb-2 flex items-center justify-between">
                    <CardTitle className="text-xl">Harmony</CardTitle>
                    <Badge variant="success">{tc("available")}</Badge>
                  </div>
                  <CardDescription>
                    {t("products.harmony.tagline")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-between gap-6">
                  <p className="text-sm text-muted-foreground">
                    {t("products.harmony.description")}
                  </p>
                  <Button asChild className="self-start">
                    <Link href="/signup">
                      {t("products.harmony.cta")}
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              <Card className="flex flex-col opacity-95">
                <CardHeader>
                  <div className="mb-2 flex items-center justify-between">
                    <CardTitle className="text-xl">Opera</CardTitle>
                    <Badge variant="outline">{tc("comingSoon")}</Badge>
                  </div>
                  <CardDescription>
                    {t("products.opera.tagline")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-between gap-6">
                  <p className="text-sm text-muted-foreground">
                    {t("products.opera.description")}
                  </p>
                  <Button variant="secondary" className="self-start" disabled>
                    {tc("comingSoon")}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Principles */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight">
              {t("principles.title")}
            </h2>
            <p className="mt-3 text-muted-foreground">
              {t("principles.subtitle")}
            </p>
          </div>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {principleKeys.map((key) => {
              const Icon = principleIcons[key];
              return (
                <li key={key}>
                  <Card className="h-full">
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <Icon className="size-5" aria-hidden="true" />
                        </span>
                        <CardTitle className="text-base">
                          {t(`principles.${key}.title`)}
                        </CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        {t(`principles.${key}.description`)}
                      </p>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <Logo />
          <p className="flex items-center gap-1.5">
            <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
            {t("footer.tagline")}
          </p>
          <p>
            © {new Date().getFullYear()} {t("footer.rights")}
          </p>
        </div>
      </footer>
    </div>
  );
}
