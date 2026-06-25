import Link from "next/link";
import { HarmonyLogo } from "@/components/brand/harmony-logo";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" aria-label="Harmony home">
          <HarmonyLogo />
        </Link>
        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </header>
      <main
        id="main-content"
        className="flex flex-1 items-center justify-center px-4 py-10"
      >
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
