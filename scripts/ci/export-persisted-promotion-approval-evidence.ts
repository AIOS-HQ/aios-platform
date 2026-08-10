import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  loadPersistedPromotionApprovalEvidenceWithClient,
  type PromotionApprovalEvidenceInput,
} from "../../src/lib/promotion/approval-evidence-shared";
import { validatePromotionApprovalEvidence } from "./promotion-approval-evidence.mjs";

export async function exportPersistedPromotionApprovalEvidence(
  promotionRequestId: string,
  expectedTargetSha: string,
  outputPath: string,
): Promise<PromotionApprovalEvidenceInput> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("supabase_admin_unavailable");
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const mapped = await loadPersistedPromotionApprovalEvidenceWithClient(client, promotionRequestId);
  validatePromotionApprovalEvidence(mapped, { expectedSha: expectedTargetSha });
  writeFileSync(outputPath, `${JSON.stringify(mapped, null, 2)}\n`, "utf8");
  return mapped;
}

async function main() {
  const promotionRequestId = process.argv[2];
  const expectedTargetSha = process.argv[3];
  const outputPath = process.argv[4];

  if (!promotionRequestId || !expectedTargetSha || !outputPath) {
    throw new Error("usage: export-persisted-promotion-approval-evidence <promotion-request-id> <expected-target-sha> <output-path>");
  }

  await exportPersistedPromotionApprovalEvidence(promotionRequestId, expectedTargetSha, outputPath);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    const code = error && typeof error === "object" && "code" in error && error.code ? String(error.code) : String(error?.message ?? "export_failed");
    console.error(code);
    process.exit(1);
  });
}
