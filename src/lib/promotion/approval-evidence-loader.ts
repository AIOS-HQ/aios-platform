import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  loadPersistedPromotionApprovalEvidenceWithClient,
  type PromotionApprovalEvidenceInput,
} from "@/lib/promotion/approval-evidence-shared";

export type { PromotionApprovalEvidenceInput } from "@/lib/promotion/approval-evidence-shared";

export async function loadPersistedPromotionApprovalEvidence(
  promotionRequestId: string,
): Promise<PromotionApprovalEvidenceInput> {
  const admin = createAdminClient();
  if (!admin) throw new Error("supabase_admin_unavailable");
  return loadPersistedPromotionApprovalEvidenceWithClient(admin, promotionRequestId);
}
