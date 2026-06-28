export type SettingsRouteCard = {
  key:
    | "integrations"
    | "connections"
    | "diagnostics"
    | "memory"
    | "learning"
    | "activity"
    | "approvals"
    | "auditor";
  href: string;
  namespace:
    | "integrations"
    | "connections"
    | "diagnostics"
    | "memory"
    | "learning"
    | "activity"
    | "approvals"
    | "auditor";
  founderOnly?: boolean;
};

export const SETTINGS_ROUTE_CARDS: SettingsRouteCard[] = [
  { key: "integrations", href: "/settings/integrations", namespace: "integrations" },
  { key: "connections", href: "/settings/connections", namespace: "connections" },
  { key: "diagnostics", href: "/settings/diagnostics", namespace: "diagnostics" },
  { key: "memory", href: "/settings/memory", namespace: "memory" },
  { key: "learning", href: "/settings/learning", namespace: "learning" },
  { key: "activity", href: "/settings/activity", namespace: "activity" },
  { key: "approvals", href: "/settings/approvals", namespace: "approvals" },
  { key: "auditor", href: "/settings/auditor", namespace: "auditor", founderOnly: true },
];

export function settingsRouteCardsForRole(isFounder: boolean): SettingsRouteCard[] {
  return SETTINGS_ROUTE_CARDS.filter((card) => card.founderOnly && isFounder);
}
