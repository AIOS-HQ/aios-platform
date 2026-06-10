# GitHub Connector — Founder Setup (PR 6c)

Harmony's GitHub connector uses an OAuth App. It is **dormant** until the two env
vars below are present; no secrets live in the repo. Read capabilities run
autonomously; **merge PR requires approval**; **delete repository is blocked /
high-risk**. All actions are owner-scoped and audited in `agent_actions`.

## 1. Create a GitHub OAuth App

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**
   (for an organization, use the org's Developer settings).
2. **Application name:** e.g. `Harmony`.
3. **Homepage URL:** your production site URL (e.g. `https://<prod-domain>`).
4. **Authorization callback URL** (must match exactly):
   ```
   https://<prod-domain>/api/integrations/github/callback
   ```
   For local development add a second OAuth App (or callback) with
   `http://localhost:3000/api/integrations/github/callback`.
5. Click **Register application**, then **Generate a new client secret**.
6. Copy the **Client ID** and **Client secret**.

Requested scopes: `read:user`, `repo`.

## 2. Set Vercel environment variables

Add both to **Vercel → Project → Settings → Environment Variables**
(Production and Preview), then redeploy:

```
GITHUB_OAUTH_CLIENT_ID=<your client id>
GITHUB_OAUTH_CLIENT_SECRET=<your client secret>
```

> The callback uses the site's base URL (`SITE_URL` / configured site URL), so
> ensure that is set correctly for the environment.

## 3. Result

- With the vars present, GitHub shows **Ready for Authorization** on
  `/settings/connections`, with an **Authorize** button.
- Authorize → GitHub consent → callback stores an owner-scoped token →
  status becomes **Connected**.
- Read actions (repos, issues, PRs, branches, workflows, build/deploy status)
  execute autonomously and are audited. Merge PR routes to the **Approval
  Center**; delete repository is flagged **High risk**.

## Notes

- GitHub OAuth-App tokens are long-lived (no refresh token); `expires_at` is null
  and refresh is a no-op. If you later switch to a GitHub **App** with token
  expiry, the existing `getValidAccessToken` refresh path handles it.
- Disconnecting removes the stored token (owner-scoped).
- Encrypting token columns at rest remains a recommended hardening step.
