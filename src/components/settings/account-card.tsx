import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";
import type { UserRole } from "@/types/database";

export async function AccountCard({
  email,
  role,
}: {
  email: string;
  role: UserRole;
}) {
  const t = await getTranslations("settings");
  const tr = await getTranslations("roles");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("account.title")}</CardTitle>
        <CardDescription>{t("account.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-medium">{t("account.email")}</p>
          <p className="truncate text-sm text-muted-foreground">{email}</p>
        </div>
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-medium">{t("account.role")}</p>
          <Badge variant="secondary">{tr(role)}</Badge>
        </div>
      </CardContent>
      <CardFooter className="border-t pt-6">
        <form action={signOut}>
          <Button type="submit" variant="outline">
            {t("account.signOut")}
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}
