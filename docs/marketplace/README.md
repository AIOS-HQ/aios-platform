# AIOS Marketplace

One universal marketplace over the Universal Capability Runtime. Every catalog is
the SAME `MarketplaceItem` shape distinguished by `kind`, so versioning,
verification, ratings, dependencies, the install lifecycle, and visibility are
implemented once and inherited everywhere.

The canonical Marketplace product model lives in
[`docs/product/AIOS_PRODUCT_ARCHITECTURE.md`](../product/AIOS_PRODUCT_ARCHITECTURE.md).
Marketplace, Company Templates, Company Builder, AI workforce deployment,
capability installation, and company provisioning are first-class AIOS product
capabilities. Third-party sellers, commerce/revenue sharing, deep public
storefront content, and advanced entitlement UX remain separate product
completion milestones.

## Storefront categories (12)
`company_template` · `department` · `workforce` · `skill` · `connector` ·
`workflow` · `dashboard` · `industry` · `branding_pack` · `knowledge_pack` ·
`founder_pack` · `developer_tool` — see `categories.ts` (`MARKETPLACE_CATEGORIES`).

## Engine (`src/lib/marketplace/`, pure — shipped)
`types.ts` · `categories.ts` · `semver.ts` · `registry.ts` (ratings, visibility,
verification policy, dependency resolution) · `install.ts` (install/update/
rollback/uninstall planning) · `templates/` (10 Company Templates). 91 unit tests.

## Persistence — LIVE ✅ (Founder-approved, migration applied)
Migration `marketplace_persistence` (prod, Postgres 17):

| Table | Purpose |
|---|---|
| `marketplace_items` | Listing: kind, slug, name, description, visibility, verification, tags, owner (`user_id`), optional `company_id`. |
| `marketplace_item_versions` | Immutable versions: semver, changelog, checksum, `artifact_ref`, `dependencies` (jsonb), `min_runtime`, `yanked`. |
| `marketplace_item_ratings` | 1–5 stars, one per user per item. |
| `company_installations` | What a company has installed: item, `installed_version`, source, enabled (unique per company+item). |

### RLS (mirrors the platform `auth.uid() = user_id` convention)
- **Read:** your own rows **OR** verified marketplace-public items (+ their versions/ratings).
- **Write (items):** end users may create/manage **company-private, unverified** items only. Publishing **marketplace-public** and setting **verified** is a privileged **service-role** path (bypasses RLS) — so users cannot self-publish or self-verify.
- **Installations:** strictly owner-scoped (`auth.uid() = user_id`).

### Server actions (`actions.ts` — wired to the engine)
`installMarketplaceItem` · `updateMarketplaceItem` · `rollbackMarketplaceItem` ·
`uninstallMarketplaceItem`. Each loads the RLS-scoped catalog + the company's
installed-state (`persistence.ts`), asks the pure engine for a plan (dependencies
resolved; cycles/conflicts detected; uninstall blocked on dependents), and only
then writes owner-scoped `company_installations` rows (guarded by company
ownership + RLS). A blocked plan is returned unapplied so the human sees why
first. `server-only` / `"use server"` modules — never exported from the pure
`index.ts` barrel, so no server code leaks into client bundles.

### Security
Marketplace artifacts are **configuration + knowledge references only** — never
secrets/tokens. Connector steps surface a re-consent reminder.

## Held for Founder preview
The visible **storefront UI** (browse categories, item detail with versions/
ratings/dependencies, install/update/rollback plan view) — pending a held UX
preview. Seeding the 10 Company Templates as public items is a follow-up
service-role publish step (needs the platform publisher identity).
