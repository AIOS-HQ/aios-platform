import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Separator } from "@/components/ui/separator";
import { primaryNav, secondaryNav } from "./nav-config";
import { NavLink } from "./nav-link";

/** Persistent desktop sidebar. */
export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-16 items-center px-5">
        <Link href="/harmony" aria-label="AIOS home">
          <Logo />
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Main">
        {primaryNav.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
        <Separator className="my-2" />
        {secondaryNav.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
      </nav>
    </aside>
  );
}
