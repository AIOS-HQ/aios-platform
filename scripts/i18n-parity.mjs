#!/usr/bin/env node
/**
 * i18n parity check: every key present in en.json must exist in es.json (and
 * vice-versa), and ICU placeholders ({name}, {count}, ...) must match per key.
 * Exits non-zero on any divergence so CI fails fast.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const load = (name) =>
  JSON.parse(readFileSync(join(root, "messages", name), "utf8"));

const flatten = (obj, prefix = "") =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? flatten(v, `${prefix}${k}.`)
      : [[`${prefix}${k}`, String(v)]],
  );

const en = Object.fromEntries(flatten(load("en.json")));
const es = Object.fromEntries(flatten(load("es.json")));
const enKeys = Object.keys(en);
const esKeys = Object.keys(es);

const placeholders = (s) =>
  [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

const missingInEs = enKeys.filter((k) => !(k in es));
const missingInEn = esKeys.filter((k) => !(k in en));
const icuMismatches = enKeys.filter(
  (k) => k in es && placeholders(en[k]) !== placeholders(es[k]),
);

console.log(
  `i18n: EN=${enKeys.length} ES=${esKeys.length} ` +
    `missingES=${missingInEs.length} missingEN=${missingInEn.length} ` +
    `icuMismatch=${icuMismatches.length}`,
);

const ok =
  missingInEs.length === 0 &&
  missingInEn.length === 0 &&
  icuMismatches.length === 0;

if (!ok) {
  if (missingInEs.length) console.error("Missing in ES:", missingInEs.slice(0, 25));
  if (missingInEn.length) console.error("Missing in EN:", missingInEn.slice(0, 25));
  if (icuMismatches.length) console.error("ICU mismatches:", icuMismatches.slice(0, 25));
  process.exit(1);
}

console.log("i18n parity OK");
