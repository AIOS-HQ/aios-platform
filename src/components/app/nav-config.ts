import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  Building2,
  Clapperboard,
  Code2,
  CreditCard,
  Eye,
  Gauge,
  LayoutDashboard,
  Lightbulb,
  ListChecks,
  ListTodo,
  MessageSquare,
  Plug,
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
  CreditCard,
  Eye,
  Gauge,
  LayoutDashboard,
  Lightbulb,
  ListChecks,
  ListTodo,
  MessageSquare,
  Plug,
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
 * - "founder": the Founder OS / Command Center — workforce, autonomy, review,
 *   approvals, comms, content, integrations, code, outcomes, etc. Visible only
 *   to founders/admins.
 * - "customer": the customer's own surfaces (guided setup, tasks, goals, notes).
 *   Visible only to non-founder customers. Founders reach the same capabilities
 *   by asking Harmony (the single operational interface), so these are
 *   intentionally absent from the founder sidebar.
 * - "all": Harmony herself, the Dashboard (the executive/home surface), and
 *   settings — shown to every authenticated user, founders included.
 *
 * Founder-only operational routes that used to live in the founder sidebar
 * (Briefing, Objectives, Operations, Work Management) are no longer listed in
 * any section: they remain founder-gated, reachable routes (so nothing is
 * removed) and are surfaced inside the Harmony workspace, which is now the
 * founder's single operational interface. "One Harmony. One conversation. One
 * operating system."
 */
export type NavAudience = "all" | "founder" | "customer";

export type NavSection = {
  /** Optional key under `nav.sections`; omit for an unlabeled group. */
  titleKey?: string;
  /** Audience gate (default "all"). */
  audience?: NavAudience;
  items: NavItem[];
};

/**
 * Application navigation. The founder navigation philosophy: Harmony is the
 * first operational entry, the Dashboard is the executive home, and the Command
 * Center is the operational workspace — in that order. Harmony (operator) and
 * the Dashboard are audience "all" and sit at the top for everyone. The
 * "command" group is the Founder OS (audience "founder"). The "personal" group
 * is the customer's own surfaces (audience "customer"); founders don't see
 * those in the sidebar because they ask Harmony for today's briefing,
 * objectives, operational status, work management, tasks, goals, and notes
 * instead — the Harmony workspace surfaces all of it. Briefing / Objectives /
 * Operations / Work Management are deliberately not listed (founder-reachable
 * routes consolidated into Harmony).
 */
export const navSections: NavSection[] = [
  {
    titleKey: "primary",
    audience: "all",
    items: [
      { href: "/harmony/operator", labelKey: "operator", icon: "Sparkles" },
      { href: "/harmony/personal", labelKey: "dashboard", icon: "LayoutDashboard" },
    ],
  },
  {
    titleKey: "command",
    audience: "founder",
    items: [
      { href: "/harmony", labelKey: "commandCenter", icon: "LayoutDashboard", exact: true },
      { href: "/harmony/oversight", labelKey: "oversight", icon: "Eye" },
      { href: "/harmony/executive", labelKey: "executive", icon: "Gauge" },
      { href: "/harmony/workforce", labelKey: "workforce", icon: "Users" },
      { href: "/harmony/companies", labelKey: "companies", icon: "Building2" },
      { href: "/harmony/review", labelKey: "review", icon: "ListTodo" },
      { href: "/harmony/autonomy", labelKey: "autonomy", icon: "Sparkles" },
      { href: "/harmony/approvals", labelKey: "approvals", icon: "ShieldCheck" },
      { href: "/settings/auditor", labelKey: "auditor", icon: "Gauge" },
      { href: "/harmony/activity", labelKey: "activity", icon: "Activity" },
      { href: "/harmony/comms", labelKey: "comms", icon: "MessageSquare" },
      { href: "/harmony/content", labelKey: "content", icon: "Clapperboard" },
      { href: "/harmony/integrations", labelKey: "integrations", icon: "Plug" },
      { href: "/harmony/code", labelKey: "code", icon: "Code2" },
      { href: "/harmony/outcomes", labelKey: "outcomes", icon: "Building2" },
      { href: "/settings/branding", labelKey: "branding", icon: "Building2" },
    ],
  },
  {
    titleKey: "personal",
    audience: "customer",
    items: [
      { href: "/harmony/onboarding", labelKey: "onboarding", icon: "Sparkles" },
      { href: "/harmony/tasks", labelKey: "tasks", icon: "ListTodo" },
      { href: "/harmony/goals", labelKey: "goals", icon: "Target" },
      { href: "/harmony/notes", labelKey: "notes", icon: "StickyNote" },
    ],
  },
  {
    titleKey: "aios",
    audience: "customer",
    items: [
      { href: "/settings/memory", labelKey: "brain", icon: "BrainCircuit" },
      { href: "/settings/learning", labelKey: "learning", icon: "Lightbulb" },
      { href: "/settings/activity", labelKey: "activity", icon: "Activity" },
      { href: "/settings/approvals", labelKey: "approvalCenter", icon: "ShieldCheck" },
      { href: "/settings/integrations", labelKey: "integrations", icon: "Plug" },
      { href: "/settings/connections", labelKey: "connections", icon: "Plug" },
      { href: "/settings/diagnostics", labelKey: "diagnostics", icon: "AlertTriangle" },
    ],
  },
  {
    titleKey: "account",
    audience: "all",
    items: [
      { href: "/settings/billing", labelKey: "planBilling", icon: "CreditCard" },
      { href: "/settings", labelKey: "settings", icon: "Settings", exact: true },
    ],
  },
];

/**
 * Sections visible to the given audience. Founders see "all" + "founder" (never
 * the customer-only tool pages); customers see "all" + "customer" (never the
 * Founder OS). Sections with no explicit audience default to "all".
 */
export function sectionsForAudience(isFounder: boolean): NavSection[] {
  return navSections.filter((s) => {
    const audience = s.audience ?? "all";
    if (audience === "all") return true;
    return isFounder ? audience === "founder" : audience === "customer";
  });
}

/**
 * Legacy customer routes that no longer appear in the nav but must remain
 * reachable by customers so their server-side redirects to the unified Harmony
 * experience run (instead of being bounced by the Founder OS gate).
 */
const LEGACY_CUSTOMER_REDIRECTS = ["/harmony/advisor", "/harmony/brain"];

/**
 * Customer-experience path prefixes under /harmony — derived from the
 * non-founder nav sections ("all" + "customer", the single source of truth)
 * plus legacy redirect routes. Used to gate founder routes: any /harmony path
 * NOT listed here is treated as founder-only.
 */
export const CUSTOMER_HARMONY_PREFIXES: string[] = [
  ...navSections
    .filter((s) => (s.audience ?? "all") !== "founder")
    .flatMap((s) => s.items.map((i) => i.href))
    .filter((href) => href.startsWith("/harmony/")),
  ...LEGACY_CUSTOMER_REDIRECTS,
];

/**
 * True when `pathname` is a Founder OS route under /harmony (i.e. NOT part of the
 * customer experience). The /harmony index itself is founder (the Command
 * Center); customers are routed to their Harmony home instead. Unknown /harmony
 * subpaths default to founder (default-deny) so new founder routes stay private.
 * Founder-only operational routes that were removed from the sidebar (briefing,
 * objectives, operations, work, work-items) are not customer prefixes, so they
 * stay founder-reachable here while no longer cluttering the sidebar.
 */
export function isFounderHarmonyPath(pathname: string): boolean {
  if (!pathname.startsWith("/harmony")) return false;
  const isCustomer = CUSTOMER_HARMONY_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  return !isCustomer;
}
