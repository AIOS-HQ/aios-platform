import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { Toaster } from "@/components/ui/sonner";
import { ThemeScript } from "@/components/theme-script";
import { APP_DESCRIPTION, APP_FULL_NAME } from "@/lib/constants";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://aios-platform.com"),
  title: { default: `${APP_FULL_NAME} — Intelligent Operating Systems`, template: `%s · ${APP_FULL_NAME}` },
  description: APP_DESCRIPTION,
  applicationName: APP_FULL_NAME,
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1020" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const t = await getTranslations("common");
  // CSP nonce set by middleware; lets the inline theme script run under a
  // nonce-based policy (no-op when CSP is off — nonce is simply undefined).
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang={locale} suppressHydrationWarning className="h-full">
      <head>
        <ThemeScript nonce={nonce} />
      </head>
      <body className="min-h-full bg-background text-foreground antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
        >
          {t("skipToContent")}
        </a>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
          <Toaster richColors closeButton position="top-right" />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
