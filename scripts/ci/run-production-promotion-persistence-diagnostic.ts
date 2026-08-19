import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  PRODUCTION_PROMOTION_DIAGNOSTIC_REQUEST_ID,
  runPromotionPersistenceReadOnlyDiagnosticWithClient,
} from "../../src/lib/promotion/approval-evidence-shared";

export async function runProductionPromotionPersistenceDiagnostic(
  promotionRequestId: string = PRODUCTION_PROMOTION_DIAGNOSTIC_REQUEST_ID,
) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("supabase_admin_unavailable");
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return runPromotionPersistenceReadOnlyDiagnosticWithClient(client, promotionRequestId);
}

async function main() {
  const promotionRequestId = process.argv[2] || PRODUCTION_PROMOTION_DIAGNOSTIC_REQUEST_ID;
  const outputPath = process.argv[3] || "production-promotion-persistence-diagnostic.json";

  const diagnostic = await runProductionPromotionPersistenceDiagnostic(promotionRequestId);
  writeFileSync(outputPath, `${JSON.stringify(diagnostic, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(diagnostic, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    const code = error && typeof error === "object" && "code" in error && error.code
      ? String(error.code)
      : String(error?.message ?? "production_promotion_persistence_diagnostic_failed");
    console.error(code);
    process.exit(1);
  });
}

