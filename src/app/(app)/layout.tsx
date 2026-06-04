import { requireUser } from "@/lib/auth/user";
import { getProfile } from "@/lib/data/profile";
import { AppShell } from "@/components/app/app-shell";
import { getInitials } from "@/lib/utils";

// Authenticated routes read cookies/session — always render dynamically.
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const profile = await getProfile(user.id);

  const name =
    profile?.full_name?.trim() || user.email?.split("@")[0] || "User";
  const email = user.email ?? "";
  const initials = getInitials(profile?.full_name?.trim() || email);

  return (
    <AppShell name={name} email={email} initials={initials}>
      {children}
    </AppShell>
  );
}
