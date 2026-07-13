import Link from "next/link";
import { useTranslations } from "next-intl";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const t = useTranslations("notFound");

  return (
    <main
      id="main-content"
      className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center"
    >
      <Logo />
      <div className="space-y-2">
        <p className="text-6xl font-bold tracking-tight text-primary">404</p>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="max-w-md text-muted-foreground">{t("description")}</p>
      </div>
      <Button asChild>
        <Link href="/">{t("cta")}</Link>
      </Button>
    </main>
  );
}
