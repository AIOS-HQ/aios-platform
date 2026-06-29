"use server";

import { runMasonProductionRuntime } from "@/lib/harmony/code/mason-production-runtime";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export async function handleMasonEngineeringMessage(input: {
  userId: string;
  message: string;
  founderApproved?: boolean;
  companyId?: string | null;
  repository?: string | null;
}) {
  const slug = slugify(input.message);

  return runMasonProductionRuntime({companyId: input.companyId ?? null,
    userId: input.userId,
    
    objective: input.message,
    repository:
  input.repository ??
  process.env.HARMONY_DEFAULT_GITHUB_REPO ??
  process.env.GITHUB_DEFAULT_REPO ??
  "AIOS-HQ/aios-platform",
    requesterRole: "founder",
    founderApproved: input.founderApproved === true,
    branchName: `mason/${slug || "engineering-task"}`,
  });
}
