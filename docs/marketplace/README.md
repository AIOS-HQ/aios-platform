# AIOS Marketplace

One universal marketplace over the Universal Capability Runtime. Every catalog is
the SAME `MarketplaceItem` shape distinguished by `kind`, so versioning,
verification, ratings, dependencies, the install lifecycle, and visibility are
implemented once and inherited everywhere.

## Catalogs (`MarketplaceItemKind`)
`workforce` · `skill` · `department` · `connector` · `workflow` · `automation` ·
`dashboard` · `industry` · `company_template`

## Engine (`src/lib/marketplace/`, additive — shipped)
Pure, dependency-free, fully unit-tested (42 tests), runtime-agnostic:

| File | Responsibility |
|---|---|
| `types.ts` | Item model: versions, verification, ratings, dependencies, visibility, install-state, plans. |
| `semver.ts` | `parseSemver` · `compareSemver` · `satisfies` (exact/`^`/`~`/comparators/wildcards/AND/`\|\|`) · `maxSatisfying`. |
| `registry.ts` | `averageRating` · `latestVersion` · `listByKind` · `visibleTo` · `isPublicInstallable` · `resolveDependencies` (topological order, cycle/conflict/missing detection). |
| `install.ts` | `planInstall` · `planUpdate` · `planRollback` · `planUninstall` — pure `InstallPlan`s, side-effect-free. |

### Every item supports
Versioning (semver, yank) · Verification (`unverified`/`pending`/`verified`/`rejected`; only **verified** public items are installable) · Ratings (1–5) · Dependencies (semver ranges, resolved with cycle/conflict/missing detection) · Installation / Updates / Rollback (yanked versions remain resolvable for rollback) · Company-private and Marketplace-public visibility.

### Security
Marketplace artifacts are **configuration + knowledge references only** — never
secrets/tokens. Installing a connector item wires config; credentials are
re-consented in the target company. Every plan touching a `connector` surfaces
that reminder as a warning.

## Persistence — HELD (Founder gate: production-impacting schema)
The engine plans over in-memory catalogs + install-state so it needs no schema
to exist or be tested. Turning it live requires the following migration, which
is **not applied** — proposed for Founder approval:

- `marketplace_items` (id, kind, slug, name, description, publisher_id, company_id NULL, visibility, verification, tags[], timestamps)
- `marketplace_item_versions` (item_id FK, version, changelog, checksum, artifact_ref, dependencies jsonb, min_runtime, yanked, created_at)
- `marketplace_item_ratings` (item_id FK, user_id, stars, comment, created_at)
- `company_installations` (company_id, item_id, installed_version, source, enabled, installed_at)
- **RLS:** public rows readable by all; private rows owner-scoped; installations owner-scoped. Verification transitions restricted to platform/admin.
- **Server actions** execute an approved `InstallPlan` transactionally; installations write to `company_installations` and re-provision into the Company Context Envelope.

Until approved, the engine powers previews, dependency inspection, and planning.
