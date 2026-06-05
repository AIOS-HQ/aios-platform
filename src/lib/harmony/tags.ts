import { LIMITS } from "@/lib/limits";

/**
 * Parse a comma-separated tag string into a clean, de-duplicated, capped list.
 * Shared by Notes and Personal Brain so tag handling stays consistent.
 *
 * - trims whitespace, drops empty entries
 * - drops entries longer than `LIMITS.tag`
 * - de-duplicates (first occurrence wins, original order preserved)
 * - caps the result at `LIMITS.tagsCount`
 */
export function parseTags(
  input: FormDataEntryValue | string | null | undefined,
): string[] {
  const seen = new Set<string>();
  for (const raw of String(input ?? "").split(",")) {
    const tag = raw.trim();
    if (tag.length > 0 && tag.length <= LIMITS.tag) seen.add(tag);
    if (seen.size >= LIMITS.tagsCount) break;
  }
  return [...seen];
}

/** Distinct tags across items, sorted case-insensitively for stable UI lists. */
export function uniqueTags(items: ReadonlyArray<{ tags: string[] }>): string[] {
  const set = new Set<string>();
  for (const item of items) {
    for (const tag of item.tags ?? []) set.add(tag);
  }
  return [...set].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}
