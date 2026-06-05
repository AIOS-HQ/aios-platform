/**
 * Code Department — future integration targets (design-only).
 *
 * These are the systems the Code Department will eventually orchestrate
 * (issues, PRs, releases, deploys, CI). Nothing is wired up yet; this list
 * drives the "Integrations" panel so the architecture is ready to connect them.
 */
export type CodeIntegration = {
  key: string;
  name: string;
};

export const CODE_INTEGRATIONS: readonly CodeIntegration[] = [
  { key: "github", name: "GitHub" },
  { key: "hyperagent", name: "HyperAgent" },
  { key: "vercel", name: "Vercel" },
  { key: "supabase", name: "Supabase" },
  { key: "ci", name: "CI/CD" },
] as const;
