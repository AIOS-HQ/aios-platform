/** URL-safe slug helpers for companies (owner OS). Pure + dependency-free. */

// Combining diacritical marks (after NFKD normalization), stripped so accented
// names slugify cleanly (e.g. "Peña" → "pena").
const COMBINING_MARKS = /[̀-ͯ]/g;

/** Slugify a name into a lowercase, hyphenated, URL-safe slug (max 48 chars). */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

/** Return a slug for `base` that is unique against `taken` (appends -2, -3, …). */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  const root = slugify(base) || "company";
  if (!set.has(root)) return root;
  let n = 2;
  while (set.has(`${root}-${n}`)) n += 1;
  return `${root}-${n}`;
}
