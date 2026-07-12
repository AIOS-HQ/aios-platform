export interface SelfTestProbe {
  /** Read-only identity endpoint. */
  url: string;
  label: string;
  /** Additional static headers required by the provider. */
  headers?: Record<string, string>;
  /** Extract the connected-account label from the JSON (no tokens or secrets). */
  account: (json: unknown) => string | null;
}

export const SELF_TEST_PROBES: Record<string, SelfTestProbe> = {
  github: {
    url: "https://api.github.com/user",
    label: "GitHub user profile",
    account: (j) => (j as { login?: string; name?: string })?.login ?? (j as { name?: string })?.name ?? null,
  },
  linkedin: {
    url: "https://api.linkedin.com/v2/userinfo",
    label: "LinkedIn OpenID profile",
    account: (j) => (j as { email?: string; name?: string; sub?: string })?.email
      ?? (j as { name?: string })?.name
      ?? (j as { sub?: string })?.sub
      ?? null,
  },
  x: {
    url: "https://api.x.com/2/users/me?user.fields=username",
    label: "X users.me",
    account: (j) => {
      const data = (j as { data?: { username?: string; id?: string } })?.data;
      if (!data?.username && !data?.id) return null;
      return [data.username ? `@${data.username}` : null, data.id].filter(Boolean).join(" · ");
    },
  },
  slack: {
    url: "https://slack.com/api/auth.test",
    label: "Slack auth.test",
    account: (j) => {
      const body = j as { team?: string; user?: string; team_id?: string; user_id?: string };
      return [body.team ?? body.team_id, body.user ?? body.user_id].filter(Boolean).join(" · ") || null;
    },
  },
  notion: {
    url: "https://api.notion.com/v1/users/me",
    label: "Notion users.me",
    headers: { "Notion-Version": "2022-06-28" },
    account: (j) => (j as { name?: string; id?: string })?.name ?? (j as { id?: string })?.id ?? null,
  },
  discord: {
    url: "https://discord.com/api/users/@me",
    label: "Discord users.me",
    account: (j) => {
      const body = j as { username?: string; global_name?: string; id?: string };
      return body.global_name ?? body.username ?? body.id ?? null;
    },
  },
  gmail: {
    url: "https://gmail.googleapis.com/gmail/v1/users/me/profile",
    label: "Gmail profile (users.getProfile)",
    account: (j) => (j as { emailAddress?: string })?.emailAddress ?? null,
  },
  google_calendar: {
    url: "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1",
    label: "Google Calendar calendarList",
    account: (j) => (j as { items?: { id?: string }[] })?.items?.[0]?.id ?? null,
  },
  google_drive: {
    url: "https://www.googleapis.com/drive/v3/about?fields=user",
    label: "Google Drive about.user",
    account: (j) => {
      const user = (j as { user?: { displayName?: string; emailAddress?: string } })?.user;
      return [user?.displayName, user?.emailAddress].filter(Boolean).join(" · ") || null;
    },
  },
  youtube: {
    url: "https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true&maxResults=50",
    label: "YouTube channels.list(mine)",
    account: (j) => {
      const channel = (j as { items?: { id?: string; snippet?: { title?: string } }[] })?.items?.[0];
      if (!channel?.id && !channel?.snippet?.title) return null;
      return [channel.snippet?.title, channel.id].filter(Boolean).join(" · ");
    },
  },
};

export function hasSelfTestProbe(provider: string): boolean {
  return provider in SELF_TEST_PROBES;
}
