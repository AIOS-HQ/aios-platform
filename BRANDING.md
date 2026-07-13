# AIOS Branding System

This document defines the official branding system for AIOS and Harmony in this
repository. Product chrome, authentication, onboarding, and public marketing
surfaces must use shared components instead of recreating logos locally.

## Official Brand Split

Public website:

- Brand: AIOS.
- Purpose: marketing, education, acquisition, documentation, and conversion.
- Component: `Logo` or `LogoMark` from `src/components/brand/logo.tsx`.

Authenticated platform:

- Brand: Harmony.
- Purpose: operate the customer's company and workspace.
- Official mark: `public/branding/harmony-official-mark.svg`.
- Component: `AiosHarmonyLogo` from `src/components/brand/logo.tsx`.

`AiosHarmonyLogo` keeps its historical export name for compatibility, but it is
now the official Harmony authenticated-product lockup. It must render the
approved Harmony SVG and text for Harmony only.

## One-Mark Rule

Authenticated product chrome must render exactly one official Harmony visual
mark. Do not show an AIOS icon beside a Harmony icon. Do not compose old AIOS +
Harmony marks. Do not create a new H mark, letter badge, inline SVG, or
generated replacement.

Allowed authenticated product mark:

```tsx
import { AiosHarmonyLogo } from "@/components/brand/logo";
```

Public marketing chrome must use AIOS:

```tsx
import { Logo } from "@/components/brand/logo";
```

## Official Components

- `LogoMark`: AIOS public glyph.
- `Logo`: AIOS public glyph + wordmark.
- `HarmonyOfficialMark`: official Harmony SVG mark from
  `public/branding/harmony-official-mark.svg`.
- `AiosHarmonyLogo`: authenticated Harmony product lockup using the official
  Harmony mark.
- `HarmonyAvatar`: conversational identity for Harmony.

Legacy `HarmonyMark`, `HarmonyLogo`, and `getHarmonyLogoSrc` remain available
only for compatibility or deliberate non-chrome illustrations. They must not be
used for authenticated product chrome.

## Required Usage

Use authenticated Harmony branding in:

- authenticated sidebar;
- authenticated mobile navigation;
- workspace selector and app chrome;
- Founder Command Center;
- Workforce;
- Integrations;
- Settings;
- Deployments;
- Profile;
- authentication;
- onboarding;
- authenticated empty states where a product mark is appropriate.

Use public AIOS branding in:

- public marketing navbar;
- public marketing footer;
- public not-found/error surfaces;
- public metadata and website assets.

## HarmonyAvatar Usage Rules

`HarmonyAvatar` is the conversational identity for Harmony. It is not a product
logo and must not be used for navbar, footer, favicon, page header, auth header,
or onboarding header branding.

Use `HarmonyAvatar` only where Harmony is speaking, thinking, streaming, or
acting as an assistant in the interface, such as:

- chat message rows;
- operator console;
- Ask Harmony prompts;
- guided onboarding conversation;
- Harmony awareness and collaboration notices.

## Page Header Branding

Authenticated application pages must use the shared `PageHeader` component from
`src/components/shared/page-header.tsx`.

`PageHeader` must not render AIOS or Harmony marks inside the authenticated app
shell. The app sidebar and mobile drawer own the single canonical app chrome
mark; page headers provide breadcrumbs, titles, descriptions, and actions only.

Loading states should use `PageHeaderSkeleton` from
`src/components/shared/loaders.tsx`, which mirrors the title and description
structure without adding brand marks.

## Favicon Usage

`src/app/icon.svg` is the app icon and favicon source. It must visually match
the public AIOS mark unless a future explicit favicon migration is approved.

Do not add alternate favicon SVGs, inline favicon data URLs, or page-specific
favicon implementations.

## Spacing and Sizing Guidelines

- Default authenticated Harmony mark: `size-9`.
- Large dark header Harmony mark: `size-10 sm:size-11`.
- Public landing AIOS mark: `size-9`.
- Use `min-w-0`, truncation, and fixed mark sizes in constrained nav surfaces.
- Use `inline-flex items-center` for brand links so mark baselines align.
- Keep text labels in the shared lockup; do not rebuild wordmark text locally.
- Do not scale logo text with viewport width. Prefer explicit responsive size
  steps such as `sm:`.

## Components That Must Use Shared Branding

Authenticated Harmony:

- `src/components/app/sidebar.tsx`
- `src/components/app/mobile-nav.tsx`
- `src/components/auth/auth-shell.tsx`
- `src/app/onboarding/founder/page.tsx`
- `src/app/onboarding/harmony/page.tsx`

Public AIOS:

- `src/components/marketing/public-navbar.tsx`
- `src/components/marketing/public-footer.tsx`
- `src/components/marketing/site-header.tsx`
- `src/components/marketing/site-footer.tsx`
- `src/app/not-found.tsx`

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

If a visual needs AIOS or Harmony, import the appropriate shared component from
`src/components/brand`.

## Review Checklist

Before committing branding changes, verify:

- rendered authenticated chrome contains exactly one
  `data-harmony-product-mark="true"` element per product lockup;
- public marketing chrome imports `Logo`, not `AiosHarmonyLogo`;
- authenticated app chrome imports `AiosHarmonyLogo`, not public-only `Logo`;
- shared page headers and loading states do not import product marks;
- `HarmonyAvatar` appears only in conversational or interaction contexts;
- `npm run lint` passes;
- `npm run typecheck` passes;
- `npm run test -- tests/unit/route-audit.test.ts` passes;
- `npm run build` passes before release.
