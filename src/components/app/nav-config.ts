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

export type NavSection = {
  /** Optional key under `nav.sections`; omit for an unlabeled group. */
  titleKey?: string;
  items: NavItem[];
};

/**
 * Founder OS navigation. The Command Center is the owner's home; the Personal
 * group preserves the original Harmony tools. Links are only added here once
 * their page exists (later Sprint 3 PRs extend the Command Center group).
 */
export const navSections: NavSection[] = [
  {
    titleKey: "command",
    items: [
      { href: "/harmony", labelKey: "commandCenter", icon: "LayoutDashboard", exact: true },
      { href: "/harmony/workforce", labelKey: "workforce", icon: "Users" },
      { href: "/harmony/work", labelKey: "work", icon: "ListChecks" },
      { href: "/settings/approvals", labelKey: "approvals", icon: "ShieldCheck" },
      { href: "/settings/auditor", labelKey: "auditor", icon: "Gauge" },
      { href: "/harmony/operations", labelKey: "operations", icon: "AlertTriangle" },
      { href: "/harmony/review", labelKey: "review", icon: "ListTodo" },
      { href: "/harmony/autonomy", labelKey: "autonomy", icon: "Sparkles" },
      { href: "/settings/activity", labelKey: "activity", icon: "Activity" },
    ],
  },
  {
    items: [{ href: "/settings", labelKey: "settings", icon: "Settings" }],
  },
];
