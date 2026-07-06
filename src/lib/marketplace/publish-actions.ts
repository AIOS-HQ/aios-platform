"use server";

import { requireUser } from "@/lib/auth/user";
import { createClient } from "@/lib/supabase/server";
import { MARKETPLACE_ITEM_KINDS, type MarketplaceItemKind } from "./types";

/**
 * Marketplace publishing — create a new marketplace item + its first version.
 *
 * New items publish to the author's PRIVATE company catalog as `unverified`
 * (enforced by the owner_insert_private RLS policy: auth.uid() = user_id AND
 * visibility = 'company_private'). AIOS verifies items before they can be listed
 * publicly, so a user can never self-publish a `verified`/`marketplace_public`
 * listing. Reuses the existing marketplace_items + marketplace_item_versions
 * tables — no schema change. Marketplace assets are config/knowledge only.
 */

export interface PublishInput {
  kind: string;
  name: string;
  slug: string;
  description: string;
  version: string;
  changelog?: string;
  companyId: string | null;
  tags?: string[];
  /** License identifier/label (e.g. "MIT", "Proprietary"). Optional. */
  license?: string;
}

export interface PublishResult {
  ok: boolean;
  itemId?: string;
  error?: string;
}

const SEMVER = /^\d+\.\d+\.\d+([-+.][0-9A-Za-z.-]+)?$/;

function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function publishMarketplaceItem(input: PublishInput): Promise<PublishResult> {
  const user = await requireUser();

  const name = input.name.trim().slice(0, 120);
  const slug = normalizeSlug(input.slug || input.name);
  const description = input.description.trim().slice(0, 2000);
  const version = (input.version || "1.0.0").trim();
  const license = input.license?.trim().slice(0, 80) || null;
  const kind = (MARKETPLACE_ITEM_KINDS as readonly string[]).includes(input.kind)
    ? (input.kind as MarketplaceItemKind)
    : null;

  if (!name) return { ok: false, error: "A name is required." };
  if (!slug) return { ok: false, error: "A valid slug is required." };
  if (!kind) return { ok: false, error: "Select a valid item type." };
  if (!SEMVER.test(version)) return { ok: false, error: "Version must be semver, e.g. 1.0.0." };

  const supabase = await createClient();

  const { data: itemData, error: itemErr } = await supabase
    .from("marketplace_items")
    .insert({
      user_id: user.id,
      company_id: input.companyId,
      kind,
      slug,
      name,
      description,
      visibility: "company_private",
      verification: "unverified",
      license,
      tags: input.tags ?? [],
    })
    .select("id")
    .maybeSingle();

  if (itemErr || !itemData) {
    return { ok: false, error: itemErr?.message ?? "Could not create the item." };
  }
  const itemId = (itemData as { id: string }).id;

  const { error: verErr } = await supabase.from("marketplace_item_versions").insert({
    item_id: itemId,
    user_id: user.id,
    version,
    changelog: input.changelog?.trim().slice(0, 1000) || null,
    dependencies: [],
    yanked: false,
  });
  if (verErr) return { ok: false, error: verErr.message };

  return { ok: true, itemId };
}
