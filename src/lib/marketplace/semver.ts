/**
 * Minimal, dependency-free semver for the marketplace engine. Supports the
 * subset marketplace ranges need: exact ("1.2.3"), caret ("^1.2.3"), tilde
 * ("~1.2.3"), comparators (">=1.2.0", ">1", "<=2.0.0", "<3"), wildcards ("*",
 * "", "1.x", "1.2.x"), and space-joined AND ranges (">=1.2.0 <2.0.0").
 * Prerelease tags are supported for ordering ("2.0.0-beta.1" < "2.0.0").
 */

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

const CORE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseSemver(input: string): SemVer | null {
  const m = CORE.exec(input.trim());
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ? m[4].split(".") : [],
  };
}

function comparePre(a: string[], b: string[]): number {
  // A version with prerelease has LOWER precedence than one without.
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const ai = a[i];
    const bi = b[i];
    const an = /^\d+$/.test(ai);
    const bn = /^\d+$/.test(bi);
    if (an && bn) {
      const d = Number(ai) - Number(bi);
      if (d !== 0) return d < 0 ? -1 : 1;
    } else if (an !== bn) {
      return an ? -1 : 1; // numeric identifiers have lower precedence
    } else if (ai !== bi) {
      return ai < bi ? -1 : 1;
    }
  }
  return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
}

/** -1 if a<b, 0 if equal, 1 if a>b. */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;
  if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1;
  if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1;
  if (pa.patch !== pb.patch) return pa.patch < pb.patch ? -1 : 1;
  return comparePre(pa.prerelease, pb.prerelease);
}

function satisfiesComparator(v: SemVer, raw: string): boolean {
  const token = raw.trim();
  if (token === "" || token === "*" || token === "x" || token === "X") return true;

  // Wildcard patterns like 1.x / 1.2.x / 1.* .
  const wild = /^(\d+)(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?$/.exec(token);
  if (wild && (token.includes("x") || token.includes("X") || token.includes("*"))) {
    const major = Number(wild[1]);
    if (v.major !== major) return false;
    if (wild[2] && !/[xX*]/.test(wild[2])) {
      if (v.minor !== Number(wild[2])) return false;
    }
    return true;
  }

  const m = /^(>=|<=|>|<|=|\^|~)?\s*(.+)$/.exec(token);
  if (!m) return false;
  const op = m[1] ?? "=";
  const target = parseSemver(m[2]);
  if (!target) return false;
  const cmp = compareSemver(`${v.major}.${v.minor}.${v.patch}${v.prerelease.length ? "-" + v.prerelease.join(".") : ""}`, m[2]);

  switch (op) {
    case "=":
      return cmp === 0;
    case ">":
      return cmp > 0;
    case ">=":
      return cmp >= 0;
    case "<":
      return cmp < 0;
    case "<=":
      return cmp <= 0;
    case "^": {
      // Compatible within the left-most non-zero component.
      if (cmp < 0) return false;
      if (target.major > 0) return v.major === target.major;
      if (target.minor > 0) return v.major === 0 && v.minor === target.minor;
      return v.major === 0 && v.minor === 0 && v.patch === target.patch;
    }
    case "~": {
      // Allows patch-level changes if minor is specified.
      if (cmp < 0) return false;
      return v.major === target.major && v.minor === target.minor;
    }
    default:
      return false;
  }
}

/**
 * True if `version` satisfies `range`. A range is a space-separated set of
 * comparators that must ALL hold (logical AND). "||" OR-groups are supported.
 */
export function satisfies(version: string, range: string): boolean {
  const v = parseSemver(version);
  if (!v) return false;
  const orGroups = range.split("||");
  return orGroups.some((group) => {
    const comparators = group.trim().split(/\s+/).filter(Boolean);
    if (comparators.length === 0) return true; // empty group = any
    return comparators.every((c) => satisfiesComparator(v, c));
  });
}

/** Highest version in `versions` that satisfies `range`, or null. */
export function maxSatisfying(versions: string[], range: string): string | null {
  const ok = versions.filter((v) => parseSemver(v) && satisfies(v, range));
  if (ok.length === 0) return null;
  return ok.sort(compareSemver)[ok.length - 1];
}

/** True if `a` is a strictly newer version than `b`. */
export function isNewer(a: string, b: string): boolean {
  return compareSemver(a, b) > 0;
}
