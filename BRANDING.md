# AIOS Branding System

This document defines the official branding system for AIOS and Harmony in this
repository. Product chrome, authentication, onboarding, and public marketing
surfaces must use the shared components below instead of recreating logos
locally.

## Official Components

- AIOS primary logo: `LogoMark` in `src/components/brand/logo.tsx`.
- AIOS wordmark lockup: `Logo` in `src/components/brand/logo.tsx`.
- AIOS + Harmony lockup: `AiosHarmonyLogo` in `src/components/brand/logo.tsx`.
- Harmony brand mark and wordmark: `HarmonyMark` and `HarmonyLogo` in
  `src/components/brand/harmony-logo.tsx`.
- Harmony conversational avatar: `HarmonyAvatar` in
  `src/components/brand/harmony-logo.tsx`.
- Harmony raster asset source: `getHarmonyLogoSrc` in
  `src/components/brand/harmony-logo-asset.ts`.

## AIOS Primary Logo

`LogoMark` is the official AIOS primary mark. It is the rounded AIOS badge with
the core ring, node points, and white AIOS glyph.

Use `LogoMark` only inside shared brand components or icon-only contexts where
AIOS alone is the subject. For top-level application chrome, prefer
`AiosHarmonyLogo` so the platform brand and active product are shown together.

Do not hand-copy the AIOS SVG into route files, layouts, headers, footers, docs
examples, or feature components.

## Harmony Lockup

`AiosHarmonyLogo` is the canonical top-level lockup for the product experience:
AIOS is the platform, Harmony is the active product surface.

One-mark rule: `AiosHarmonyLogo` must render exactly one visual logo mark. The
authenticated app sidebar, mobile drawer, auth shell, onboarding headers, and
public nav/footer may show text for both `AIOS` and `Harmony`, but must not show
an AIOS icon tile beside a second Harmony icon tile. `HarmonyMark` and
`HarmonyLogo` are reserved for deliberate Harmony-only brand moments outside
ordinary app chrome.

Use `AiosHarmonyLogo` in:

- authenticated app sidebar and mobile navigation;
- public marketing navigation and footer;
- authentication headers;
- onboarding headers;
- error and not-found brand surfaces.

`HarmonyLogo` remains available for Harmony-only brand contexts, but new
top-level chrome should use `AiosHarmonyLogo` unless there is a deliberate
Harmony-only brand requirement.

## HarmonyAvatar Usage Rules

`HarmonyAvatar` is the conversational identity for Harmony. It is not a brand
logo and must not be used for navbar, footer, favicon, page header, auth header,
or onboarding header branding.

Use `HarmonyAvatar` only where Harmony is speaking, thinking, streaming, or
acting as an assistant in the interface, such as:

- chat message rows;
- operator console;
- Ask Harmony prompts;
- guided onboarding conversation;
- Harmony awareness and collaboration notices.

Do not use `HarmonyMark` or `HarmonyLogo` inside a conversation thread. Use
`HarmonyAvatar` there.

## Favicon Usage

`src/app/icon.svg` is the app icon and favicon source. It must visually match
the AIOS primary mark.

Do not add alternate favicon SVGs, inline favicon data URLs, or page-specific
favicon implementations. If the AIOS mark changes, update `LogoMark` and
`src/app/icon.svg` together.

## Navigation Branding

Navigation branding must use `AiosHarmonyLogo`.

Required import:

```tsx
import { AiosHarmonyLogo } from "@/components/brand/logo";
```

Current canonical navigation surfaces:

- `src/components/app/sidebar.tsx`
- `src/components/app/mobile-nav.tsx`
- `src/components/marketing/public-navbar.tsx`
- `src/components/marketing/site-header.tsx`

Navigation must not render ad hoc letter badges, copied SVGs, standalone
wordmarks, or separate AIOS and Harmony logos side by side.

## Page Header Branding

Application pages must use the shared `PageHeader` component from
`src/components/shared/page-header.tsx`.

`PageHeader` must not render AIOS or Harmony marks inside the authenticated app
shell. The app sidebar and mobile drawer own the single canonical app chrome
lockup; page headers provide breadcrumbs, titles, descriptions, and actions
only. Individual pages should not add their own top-of-page logo unless the page
has a specific hero or product illustration need outside the authenticated app
chrome.

Loading states should use `PageHeaderSkeleton` from
`src/components/shared/loaders.tsx`, which mirrors the title and description
structure without adding brand marks.

## Onboarding Branding

Onboarding headers must use `AiosHarmonyLogo` with inverse treatment on dark
surfaces.

Do not render a standalone `HarmonyMark`, `HarmonyLogo`, or local wordmark in
the onboarding rail or background when the header already renders
`AiosHarmonyLogo`. The lockup owns top-level onboarding branding.

Do not create local onboarding-only logos or inline SVG marks.

## Authentication Branding

Authentication headers must use `AiosHarmonyLogo` with inverse treatment on the
dark auth surface.

Do not render a standalone `HarmonyMark`, `HarmonyLogo`, or local wordmark in
auth rails, forms, or backgrounds when the header already renders
`AiosHarmonyLogo`. Auth forms and auth headers must not create their own
AIOS/Harmony logo implementation.

## Spacing and Sizing Guidelines

- Default shared lockup marks: `size-8`.
- Large dark header lockup marks: `size-10 sm:size-11`.
- Landing header lockup marks: `size-9`.
- Use `min-w-0`, truncation, and fixed mark sizes in constrained nav surfaces.
- Use `inline-flex items-center` for brand links so mark baselines align.
- Keep text labels in the shared lockup; do not rebuild wordmark text locally.
- Do not scale logo text with viewport width. Prefer explicit responsive size
  steps such as `sm:`.

## Components That Must Import Shared Branding

These components must import `AiosHarmonyLogo` from
`@/components/brand/logo` for top-level branding:

- `src/components/app/sidebar.tsx`
- `src/components/app/mobile-nav.tsx`
- `src/components/marketing/public-navbar.tsx`
- `src/components/marketing/public-footer.tsx`
- `src/components/marketing/site-header.tsx`
- `src/components/marketing/site-footer.tsx`
- `src/components/auth/auth-shell.tsx`
- `src/app/not-found.tsx`
- `src/app/onboarding/founder/page.tsx`
- `src/app/onboarding/harmony/page.tsx`

New layouts, shells, navbars, and footers must follow the same rule. New
page-header abstractions must follow the Page Header Branding rule above and
avoid authenticated app brand marks.

## Components That Must Never Create Their Own Logo

The following should never define an inline SVG, image, letter badge, or
homegrown wordmark for AIOS or Harmony:

- route pages under `src/app/**`;
- layout files under `src/app/**/layout.tsx`;
- marketing headers and footers;
- authenticated app shell, sidebar, and mobile navigation;
- auth shell and auth forms;
- onboarding pages and onboarding components;
- shared page headers and loading states;
- docs examples, story files, archived examples, or test fixtures.

If a visual needs AIOS, Harmony, or both, import the appropriate shared component
from `src/components/brand`.

## Review Checklist

Before committing branding changes, verify:

- `rg -n "<HarmonyLogo|<Logo\\b|inline-flex size-7|>A<|bg-primary text-sm font-bold" src/app src/components -S`
  finds no ad hoc top-level branding;
- `rg -n "AiosHarmonyLogo|HarmonyMark" src/components/auth src/app/onboarding -S`
  shows the canonical lockup only, with no standalone Harmony brand mark beside it;
- `rg -n "AiosHarmonyLogo|HarmonyMark|HarmonyLogo" src/components/shared/page-header.tsx src/components/shared/loaders.tsx -S`
  returns no matches;
- rendered `AiosHarmonyLogo` output contains exactly one
  `data-aios-product-mark="true"` element;
- `rg -n "HarmonyAvatar" src/app src/components -S` shows only
  conversational or interaction contexts;
- `npm run lint` passes;
- `npm run typecheck` passes;
- `npm run test -- tests/unit/route-audit.test.ts` passes;
- `npm run build` passes before release.
