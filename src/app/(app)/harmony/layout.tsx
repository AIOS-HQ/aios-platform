/**
 * Stable Harmony segment layout.
 *
 * Per-destination authorization and billing checks intentionally live in
 * template.tsx. App Router layouts persist across client navigation, while a
 * template is evaluated for every destination. Keeping this layout stable
 * prevents stale path-derived redirect state from outliving the route that
 * produced it.
 */
export default function HarmonyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
