"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import { currentUserIsAdmin } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveApprovedLinkedInOrganization } from "@/lib/integrations/linkedin-publisher";
import { getXAccount, xPublishingAdapter } from "./adapters/x";
import { linkedInPublishingAdapter } from "./adapters/linkedin";
import { approveSocialPublishJob, publishApprovedJob } from "./jobs";
import { socialMediaAssetRow, socialPublishJobRow } from "./records";
import { queueYouTubePublishJob } from "./worker";
import {
  LINKEDIN_TEST_MEDIA,
  X_TEST_MEDIA,
  buildLinkedInTestDraft,
  buildXTestDraft,
} from "./test-drafts";

async function upsertDraft(userId: string, provider: "linkedin" | "x"): Promise<void> {
  const admin = createAdminClient();
  if (!admin) throw new Error("Admin client unavailable.");
  if (provider === "linkedin") {
    const org = resolveApprovedLinkedInOrganization();
    if (!org) throw new Error("Configure LINKEDIN_ORGANIZATION_URN or LINKEDIN_ORGANIZATION_ID before creating the LinkedIn draft.");
    await admin.from("social_media_assets").upsert(socialMediaAssetRow(userId, LINKEDIN_TEST_MEDIA), { onConflict: "id" });
    await admin
      .from("social_publish_jobs")
      .upsert(socialPublishJobRow(userId, buildLinkedInTestDraft(org.urn)), { onConflict: "user_id,provider,idempotency_key" });
  } else {
    const account = await getXAccount(userId);
    await admin.from("social_media_assets").upsert(X_TEST_MEDIA.map((asset) => socialMediaAssetRow(userId, asset)), { onConflict: "id" });
    await admin
      .from("social_publish_jobs")
      .upsert(socialPublishJobRow(userId, buildXTestDraft(account.username)), { onConflict: "user_id,provider,idempotency_key" });
  }
}

export async function prepareLinkedInTestDraft(): Promise<void> {
  const user = await requireUser();
  if (!(await currentUserIsAdmin())) throw new Error("Founder access is required.");
  await upsertDraft(user.id, "linkedin");
  revalidatePath("/harmony/social");
}

export async function prepareXTestDraft(): Promise<void> {
  const user = await requireUser();
  if (!(await currentUserIsAdmin())) throw new Error("Founder access is required.");
  await upsertDraft(user.id, "x");
  revalidatePath("/harmony/social");
}

export async function approveSocialDraft(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!(await currentUserIsAdmin())) throw new Error("Founder access is required.");
  const id = String(formData.get("job_id") ?? "");
  if (id) await approveSocialPublishJob(user.id, id);
  revalidatePath("/harmony/social");
}

export async function publishSocialDraft(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!(await currentUserIsAdmin())) throw new Error("Founder access is required.");
  const id = String(formData.get("job_id") ?? "");
  const provider = String(formData.get("provider") ?? "");
  if (!id) return;
  if (provider === "youtube") {
    await queueYouTubePublishJob(user.id, id);
    revalidatePath("/harmony/social");
    return;
  }
  await publishApprovedJob({
    userId: user.id,
    jobId: id,
    adapter: provider === "x"
        ? xPublishingAdapter
        : linkedInPublishingAdapter,
  });
  revalidatePath("/harmony/social");
}
