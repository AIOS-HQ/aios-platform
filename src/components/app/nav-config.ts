import {
  BrainCircuit,
  LayoutDashboard,
  Lightbulb,
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
};

/** Primary Harmony navigation. */
export const primaryNav: NavItem[] = [
  { href: "/harmony", labelKey: "dashboard", icon: LayoutDashboard },
  { href: "/harmony/tasks", labelKey: "tasks", icon: ListTodo },
  { href: "/harmony/goals", labelKey: "goals", icon: Target },
  { href: "/harmony/notes", labelKey: "notes", icon: StickyNote },
  { href: "/harmony/brain", labelKey: "brain", icon: BrainCircuit },
  { href: "/harmony/operator", labelKey: "operator", icon: Sparkles },
  { href: "/harmony/advisor", labelKey: "advisor", icon: Lightbulb },
];

export const secondaryNav: NavItem[] = [
  { href: "/settings", labelKey: "settings", icon: Settings },
];
