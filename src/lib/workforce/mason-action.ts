"use server";

import { runMasonProductionRuntime } from "@/lib/harmony/code/mason-production-runtime";

export async function handleMasonEngineeringMessage(input: {
  userId: string;
  message: string;
}) {
  const slug = input.message
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return runMasonProductionRuntime({
    userId: input.userId,
    objective: input.message,
    repository: "AIOS-HQ/aios-platform",
    requesterRole: "founder",
    founderApproved: false,
    branchName: `mason/${slug || "engineering-task"}`,
  });
}
