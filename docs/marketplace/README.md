# AIOS Marketplace

One universal marketplace over the Universal Capability Runtime. Every catalog is
the SAME `MarketplaceItem` shape distinguished by `kind`, so versioning,
verification, ratings, dependencies, the install lifecycle, and visibility are
implemented once and inherited everywhere.

## Storefront categories (12)
The flagship product categories (`MARKETPLACE_CATEGORIES` in `categories.ts`),
each mapped to an engine `kind`:

| Category | kind | What it deploys |
|---|---|---|
| Company Templates | `company_template` | A complete autonomous company in one install. |
| AI Departments | `department` | Departments with agents, objectives, policies. |
| AI Workers | `workforce` | Individual AI specialists on the runtime. |
| Skills | `skill` | Reusable capabilities the workforce can run. |
| Connector Packs | `connector` | Provider connectors (config-only). |
| Workflow Packs | `workflow` | Multi-step orchestrated workflows. |
| Dashboard Packs | `dashboard` | Executive/operational dashboards. |
| Industry Solutions | `industry` | Vertical bundles. |
| Branding Packs | `branding_pack` | Logo/palette/voice/theme assets. |
| Knowledge Packs | `knowledge_pack` | Curated knowledge/memory seeds. |
| Founder Packs | `founder_pack` | Founder-experience presets. |
| Developer Tools | `developer_tool` | Runtime extensions/utilities. |

## Engine (`src/lib/marketplace/`, additive — shipped)
Pure, dependency-free, fully unit-tested (91 tests), runtime-agnostic:

| File | Responsibility |
|---|---|
| `types.ts` | Item model (13 kinds), versions, verification, ratings, dependencies, visibility, install-state, plans. |
| `categories.ts` | The 12 storefront categories + `categoryForKind` / `categoryBySlug`. |
| `semver.ts` | `parseSemver` · `compareSemver` · `satisfies` · `maxSatisfying`. |
| `registry.ts` | ratings · listing/visibility · verification policy · `resolveDependencies` (order + cycle/conflict/missing). |
| `install.ts` | `planInstall` · `planUpdate` · `planRollback` · `planUninstall` — pure `InstallPlan`s. |
| `templates/` | 10 Company Templates + `instantiateTemplate` (see below). |

### Every item supports
Versioning (semver, yank) · Verification (only `verified` public items installable) ·
Ratings · Dependencies (resolved, cycle/conflict/missing-aware) ·
Installation / Updates / Rollback / Uninstall · Company-private + Marketplace-public.

### Company Templates (`templates/`)
Ten launch blueprints that each provision a complete autonomous company: SaaS
Startup, Aviation Claims, Law Firm, Accounting Firm, Real Estate, Healthcare
Practice, Manufacturing, Restaurant Group, E-commerce, Startup Accelerator. Each
defines departments, an AI workforce (Harmony always coordinates), objectives,
connectors (config-only), branding tone, and knowledge seeds. `instantiateTemplate`
turns a template into a provisioning draft for a named company.

### Security
Artifacts are **configuration + knowledge references only** — never secrets/tokens.
Connector steps surface a re-consent reminder.

## Persistence — HELD (Founder gate: production-impacting schema)
The engine plans over in-memory catalogs + install-state, so it needs no schema
to exist or be tested. Going live requires (proposed, NOT applied):
`marketplace_items`, `marketplace_item_versions`, `marketplace_item_ratings`,
`company_installations` + RLS (public readable; private/installations owner-scoped;
verification transitions admin-only) + server actions that execute an approved
`InstallPlan` transactionally and re-provision into the Company Context Envelope.
