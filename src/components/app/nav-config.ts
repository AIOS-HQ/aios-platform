import {
  BrainCircuit,
  Building2,
  LayoutDashboard,
  Lightbulb,
  ListChecks,
  ListTodo,
  Settings,
  Sparkles,
  StickyNote,
  Target,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  /** Key under the `nav` translation namespace. */
  labelKey: string;
  icon: LucideIcon;
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
      { href: "/harmony", labelKey: "commandCenter", icon: LayoutDashboard, exact: true },
      { href: "/harmony/companies", labelKey: "companies", icon: Building2 },
      { href: "/harmony/objectives", labelKey: "objectives", icon: Target },
      { href: "/harmony/work", labelKey: "work", icon: ListChecks },
      // Approvals, Activity links are added by their PRs as pages ship.
    ],
  },
  {
    titleKey: "personal",
    items: [
      { href: "/harmony/personal", labelKey: "dashboard", icon: LayoutDashboard },
      { href: "/harmony/tasks", labelKey: "tasks", icon: ListTodo },
      { href: "/harmony/goals", labelKey: "goals", icon: Target },
      { href: "/harmony/notes", labelKey: "notes", icon: StickyNote },
      { href: "/harmony/brain", labelKey: "brain", icon: BrainCircuit },
      { href: "/harmony/operator", labelKey: "operator", icon: Sparkles },
      { href: "/harmony/advisor", labelKey: "advisor", icon: Lightbulb },
    ],
  },
  {
    items: [{ href: "/settings", labelKey: "settings", icon: Settings }],
  },
];
