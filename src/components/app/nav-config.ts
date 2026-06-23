import {
  Activity,
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
      { href: "/harmony/companies", labelKey: "companies", icon: "Building2" },
      { href: "/harmony/objectives", labelKey: "objectives", icon: "Target" },
      { href: "/harmony/work", labelKey: "work", icon: "ListChecks" },
      { href: "/harmony/approvals", labelKey: "approvals", icon: "ShieldCheck" },
      { href: "/settings/auditor", labelKey: "auditor", icon: "Gauge" },
      { href: "/harmony/activity", labelKey: "activity", icon: "Activity" },
      { href: "/harmony/comms", labelKey: "comms", icon: "MessageSquare" },
      { href: "/harmony/content", labelKey: "content", icon: "Clapperboard" },
      { href: "/harmony/code", labelKey: "code", icon: "Code2" },
    ],
  },
  {
    titleKey: "personal",
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
    items: [{ href: "/settings", labelKey: "settings", icon: "Settings" }],
  },
];
