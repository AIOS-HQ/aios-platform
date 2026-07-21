import "server-only";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { youTubePublishingAdapter } from "./adapters/youtube";
import { assertApprovedExactContent, mapJob, publishApprovedJob } from "./jobs";
import { markExpiredYouTubeUploadIntents } from "./uploads";

const LOCK_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_AUTOMATIC_ATTEMPTS = 5;

export async function queueYouTubePublishJob(userId: string, jobId: string): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return false;
  const { data } = await admin
    .from("social_publish_jobs")
    .select("*")
    .eq("user_id", userId)
    .eq("id", jobId)
    .eq("provider", "youtube")
    .maybeSingle();
  if (!data) return false;
  const job = mapJob(data as Record<string, unknown>);
  assertApprovedExactContent(job);
  if (job.providerPostId) return true;
  const now = new Date().toISOString();
  const { data: queued, error } = await admin
    .from("social_publish_jobs")
    .update({
      publish_requested_at: now,
      next_attempt_at: now,
      processing_status: "queued",
      last_error: null,
    })
    .eq("user_id", userId)
    .eq("id", jobId)
    .eq("provider", "youtube")
    .in("state", ["approved", "failed"])
    .eq("approved_content_hash", job.contentHash)
    .select("id")
    .maybeSingle();
  return !error && Boolean(queued);
}

type QueueRow = { id: string; user_id: string; attempts: number };

async function claimNextJob(workerId: string): Promise<QueueRow | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const now = new Date();
  const stale = new Date(now.getTime() - LOCK_TIMEOUT_MS).toISOString();
  const { data: candidates } = await admin
    .from("social_publish_jobs")
    .select("id,user_id,attempts")
    .eq("provider", "youtube")
    .not("publish_requested_at", "is", null)
    .lte("next_attempt_at", now.toISOString())
    .in("state", ["approved", "failed", "uploading", "publishing"])
    .is("provider_post_id", null)
    .or(`worker_locked_at.is.null,worker_locked_at.lt.${stale}`)
    .order("next_attempt_at", { ascending: true })
    .limit(1);
  const candidate = (candidates?.[0] ?? null) as QueueRow | null;
  if (!candidate) return null;
  const { data: claimed } = await admin
    .from("social_publish_jobs")
    .update({ worker_id: workerId, worker_locked_at: now.toISOString() })
    .eq("id", candidate.id)
    .eq("user_id", candidate.user_id)
    .or(`worker_locked_at.is.null,worker_locked_at.lt.${stale}`)
    .select("id,user_id,attempts")
    .maybeSingle();
  return claimed as QueueRow | null;
}

export async function runSocialPublishingWorkerOnce(workerId = `social-${randomUUID()}`): Promise<{
  processed: boolean;
  ok?: boolean;
  jobId?: string;
}> {
  const admin = createAdminClient();
  if (!admin) return { processed: false };
  await markExpiredYouTubeUploadIntents().catch(() => 0);
  const job = await claimNextJob(workerId);
  if (!job) return { processed: false };
  const result = await publishApprovedJob({
    userId: job.user_id,
    jobId: job.id,
    adapter: youTubePublishingAdapter,
    resumeInProgress: true,
  });
  if (result.ok) {
    await admin
      .from("social_publish_jobs")
      .update({
        publish_requested_at: null,
        next_attempt_at: null,
        worker_locked_at: null,
        worker_id: null,
      })
      .eq("id", job.id)
      .eq("worker_id", workerId);
  } else {
    const attempts = job.attempts + 1;
    const retryAt = new Date(Date.now() + Math.min(60 * 60 * 1000, 30_000 * 2 ** Math.min(attempts, 6))).toISOString();
    await admin
      .from("social_publish_jobs")
      .update({
        publish_requested_at: attempts >= MAX_AUTOMATIC_ATTEMPTS ? null : new Date().toISOString(),
        next_attempt_at: attempts >= MAX_AUTOMATIC_ATTEMPTS ? null : retryAt,
        worker_locked_at: null,
        worker_id: null,
      })
      .eq("id", job.id)
      .eq("worker_id", workerId);
  }
  return { processed: true, ok: result.ok, jobId: job.id };
}

export async function runSocialPublishingWorker(input: {
  pollIntervalMs?: number;
  signal?: AbortSignal;
} = {}): Promise<void> {
  const workerId = `social-${randomUUID()}`;
  const pollIntervalMs = Math.max(1000, input.pollIntervalMs ?? 5000);
  while (!input.signal?.aborted) {
    const result = await runSocialPublishingWorkerOnce(workerId);
    if (!result.processed) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }
}
