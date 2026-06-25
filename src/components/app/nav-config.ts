import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  Building2,
  Clapperboard,
  Code2,
  Gauge,
  LayoutDashboard,
  Lightbulb,
  ListChecks,
  ListTodo,
  MessageSquare,
  Settings,
  ShieldCheck,
  Sparkles,
  StickyNote,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Icon registry. Nav items reference an icon by STRING KEY (not the component)
 * so the config can be passed from a Server Component (Sidebar) to a Client
 * Component (NavLink) without sending a function across the boundary. The key
 * is resolved back to its component inside the client NavLink.
 */
export const NAV_ICONS = {
  Activity,
  AlertTriangle,
  BrainCircuit,
  Building2,
  Clapperboard,
  Code2,
  Gauge,
  LayoutDashboard,
  Lightbulb,
  ListChecks,
  ListTodo,
  MessageSquare,
  Settings,
  ShieldCheck,
  Sparkles,
  StickyNote,
  Target,
  Users,
} satisfies Record<string, LucideIcon>;

export type NavIconKey = keyof typeof NAV_ICONS;

export type NavItem = {
  href: string;
  /** Key under the `nav` translation namespace. */
  labelKey: string;
  /** Icon key resolved via NAV_ICONS inside the client NavLink. */
  icon: NavIconKey;
  /** Match the active state exactly (no prefix match). */
  exact?: boolean;
};

/**
 * Who a nav section is for.
 * - "founder": the Founder OS / Command Center — workforce, operations,
 *   autonomy, review, approvals, etc. Visible only to founders/admins.
 * - "all": the Harmony customer experience (personal hub + settings). Visible
 *   to every authenticated user, founders included.
 */
export type NavAudience = "all" | "founder";

export type NavSection = {
  /** Optional key under `nav.sections`; omit for an unlabeled group. */
  titleKey?: string;
  /** Audience gate (default "all"). */
  audience?: NavAudience;
  items: NavItem[];
};

/**
 * Founder OS navigation. The "command" group is the Founder Command Center and
 * is gated to founders/admins (audience: "founder"); the "personal" group is the
 * Harmony customer experience, shown to everyone. Harmony — the AI Chief of
 * Staff — is the customer-facing intelligence; the founder governance surfaces
 * stay founder-only so customers experience Harmony, not an ops console.
 */
export const navSections: NavSection[] = [
  {
    titleKey: "command",
    audience: "founder",
    items: [
      { href: "/harmony", labelKey: "commandCenter", icon: "LayoutDashboard", exact: true },
      { href: "/harmony/workforce", labelKey: "workforce", icon: "Users" },
      { href: "/harmony/briefing", labelKey: "briefing", icon: "Gauge" },
      { href: "/harmony/companies", labelKey: "companies", icon: "Building2" },
      { href: "/harmony/objectives", labelKey: "objectives", icon: "Target" },
      { href: "/harmony/work", labelKey: "work", icon: "ListChecks" },
      { href: "/harmony/work-items", labelKey: "workItems", icon: "ListChecks" },
      { href: "/harmony/review", labelKey: "review", icon: "ListTodo" },
      { href: "/harmony/autonomy", labelKey: "autonomy", icon: "Sparkles" },
      { href: "/harmony/approvals", labelKey: "approvals", icon: "ShieldCheck" },
      { href: "/settings/auditor", labelKey: "auditor", icon: "Gauge" },
      { href: "/harmony/operations", labelKey: "operations", icon: "AlertTriangle" },
      { href: "/harmony/activity", labelKey: "activity", icon: "Activity" },
      { href: "/harmony/comms", labelKey: "comms", icon: "MessageSquare" },
      { href: "/harmony/content", labelKey: "content", icon: "Clapperboard" },
      { href: "/harmony/code", labelKey: "code", icon: "Code2" },
      { href: "/harmony/outcomes", labelKey: "outcomes", icon: "Building2" },
    ],
  },
  {
    titleKey: "personal",
    audience: "all",
    items: [
      { href: "/harmony/personal", labelKey: "dashboard", icon: "LayoutDashboard" },
      { href: "/harmony/tasks", labelKey: "tasks", icon: "ListTodo" },
      { href: "/harmony/goals", labelKey: "goals", icon: "Target" },
      { href: "/harmony/notes", labelKey: "notes", icon: "StickyNote" },
      { href: "/harmony/brain", labelKey: "brain", icon: "BrainCircuit" },
      { href: "/harmony/operator", labelKey: "operator", icon: "Sparkles" },
      { href: "/harmony/advisor", labelKey: "advisor", icon: "Lightbulb" },
    ],
  },
  {
    audience: "all",
    items: [{ href: "/settings", labelKey: "settings", icon: "Settings" }],
  },
];

/** Sections visible to the given audience (founders see everything). */
export function sectionsForAudience(isFounder: boolean): NavSection[] {
  return navSections.filter((s) => isFounder || s.audience !== "founder");
}

/**
 * Customer-experience path prefixes under /harmony — derived from the non-founder
 * nav sections so there is a single source of truth. Used to gate founder routes.
 */
export const CUSTOMER_HARMONY_PREFIXES: string[] = navSections
  .filter((s) => s.audience !== "founder")
  .flatMap((s) => s.items.map((i) => i.href))
  .filter((href) => href.startsWith("/harmony/"));

/**
 * True when `pathname` is a Founder OS route under /harmony (i.e. NOT part of the
 * customer experience). The /harmony index itself is founder (the Command
 * Center); customers are routed to their Harmony home instead. Unknown /harmony
 * subpaths default to founder (default-deny) so new founder routes stay private.
 */
export function isFounderHarmonyPath(pathname: string): boolean {
  if (!pathname.startsWith("/harmony")) return false;
  const isCustomer = CUSTOMER_HARMONY_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  return !isCustomer;
}
