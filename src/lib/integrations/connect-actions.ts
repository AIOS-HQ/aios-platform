"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/user";
import { currentUserIsAdmin } from "@/lib/auth/roles";
import type { ActionState } from "@/lib/types";
import { upsertConnection } from "@/lib/integrations/connections";
import { getConnector } from "@/lib/integrations/connectors";

/**
 * Store a per-user API key for an api_key connector (Supabase, Vercel).
 * Owner-scoped. The key is written via the service-role client (upsertConnection)
 * and is never returned to the browser. This is the founder-approved per-user
 * credential path — read-only diagnostics only; write capabilities still require
 * per-action approval.
 */
export async function connectApiKeyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("diagnostics");
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: t("errors.unauthorized") };
  if (!(await currentUserIsAdmin())) {
    return { status: "error", message: t("errors.unauthorized") };
  }

  const provider = String(formData.get("provider") ?? "");
  const token = String(formData.get("token") ?? "").trim();
  const account = String(formData.get("account") ?? "").trim();

  const connector = getConnector(provider);
  if (!connector || connector.auth !== "api_key") {
    return { status: "error", message: t("errors.invalidProvider") };
  }
  if (!token) return { status: "error", message: t("errors.missingToken") };

  let ok = false;
  try {
    ok = await upsertConnection({
      user_id: user.id,
      provider,
      status: "connected",
      scopes: null,
      external_account: account || null,
      access_token: token,
      refresh_token: null,
      expires_at: null,
    });
  } catch {
    ok = false;
  }
  if (!ok) return { status: "error", message: t("errors.saveFailed") };

  revalidatePath("/settings/diagnostics");
  revalidatePath("/settings/connections");
  return { status: "success", message: t("connectedToast") };
}
