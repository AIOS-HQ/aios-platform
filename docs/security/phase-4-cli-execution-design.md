# Phase 4 — CLI / Controlled Execution Layer: Security Design

> Status: **DESIGN ONLY — not implemented.** No executable code ships with this
> document. Implementation is gated on the sign-offs and infrastructure
> decisions in [§10 Blockers & required decisions](#10-blockers--required-decisions).

This document is the threat model and security architecture for giving Harmony a
**controlled** ability to run operational commands (git, repository tasks,
filesystem, migration generation, Python, shell) on the owner's behalf. It exists
so we agree on the guardrails **before** any execution capability is built.

The guiding principle: an autonomous agent that can run commands is a remote
code execution (RCE) surface by definition. We treat it like one.

---

## 1. Purpose & scope

**In scope (eventual capabilities, behind flags, default-off):**

- Git operations (status/diff/branch/commit/push to a sandboxed checkout)
- Repository tasks (lint, codegen, dependency inspection)
- Filesystem access (read/write within a sandbox workspace)
- Migration **generation** (author SQL; never auto-apply to production)
- Python execution (in sandbox)
- Shell commands (allow-listed subset, in sandbox)

**Explicitly out of scope:**

- A general-purpose shell for end users.
- Any execution inside the Next.js server process, the production database
  network, or any environment holding production secrets.
- Automatic, unattended application of database migrations to production.
- Any command path that can reach another tenant's data.

---

## 2. Assets we are protecting

1. Production database and all user data (cross-tenant confidentiality + integrity).
2. Secrets: Supabase service-role key, Stripe keys, OpenAI key, OAuth client
   secrets, integration access/refresh tokens.
3. Source repository and deployment pipeline.
4. The host/container and the platform's availability (no resource abuse).
5. Third-party accounts reachable via stored integration tokens.

---

## 3. Threat model (actors & attacks)

| Actor | Representative threats |
|---|---|
| **Honest owner** | Accidental destructive command (`rm -rf`, `drop table`, force-push), foot-gun migrations. |
| **Malicious owner** | Deliberate attempt to read other tenants' data, exfiltrate secrets, mine crypto, pivot to infra. |
| **Compromised owner account** | Same as malicious owner, plus persistence. |
| **Prompt injection** | Hostile content in memory, emails, web pages, or integration payloads that coaxes Harmony into emitting a dangerous command. **This is the headline risk for an agent-driven executor.** |
| **Supply chain** | Malicious dependency pulled during a repo/python task. |

**STRIDE summary of the highest risks:**

- **Elevation of privilege / RCE** — arbitrary command execution is the whole feature; containment is everything.
- **Information disclosure** — secret theft, cross-tenant reads.
- **Tampering** — destructive DB/repo/filesystem operations.
- **Denial of service** — runaway/forkbomb/crypto-mining workloads.
- **Spoofing/SSRF** — command reaches internal metadata endpoints or other services.

---

## 4. Non-negotiable security principles

1. **Owner-only.** Every execution is attributed to one authenticated user; a
   command can never touch another tenant's data or run as another user.
2. **Default-deny.** Nothing runs unless it matches an explicit allow policy.
3. **Approval-required, always.** Every execution is an `agent_actions` row with
   `requires_approval = true`. There is **no** autonomy level that grants blanket
   auto-execute for CLI commands. (See §7.)
4. **Isolated sandbox.** Execution happens in an ephemeral, untrusted-by-default
   runner with **no production secrets**, **no production DB network access**, and
   **controlled egress**. Never in the web server or prod DB VPC.
5. **Least privilege & short-lived creds.** A task receives only the narrowly
   scoped, time-boxed credentials it needs — never the service-role or billing keys.
6. **No production mutation by this path.** Especially: no production DDL/DML.
   Migrations are *generated*, not *applied*, here.
7. **Full immutable audit.** Command, arguments, actor, approval, redacted
   stdout/stderr, exit code, duration — all recorded, owner-visible.
8. **Bounded resources.** Hard CPU/memory/wall-clock/output limits; kill on breach.
9. **Reversibility.** Prefer dry-run and reversible operations; destructive
   patterns are denied outright in early phases.

---

## 5. Architecture

```
Owner ──▶ Harmony (assistant)
            │  proposes a command (cli_exec tool, requiresApproval=true)
            ▼
     agent_actions row  ── status: pending ──▶ Owner approves (human-in-the-loop)
            │ approved
            ▼
   Execution broker (Next.js server)         ❌ does NOT run the command itself
            │  validates against policy (allow/deny), mints scoped creds
            ▼
   ISOLATED SANDBOX RUNNER (ephemeral)        ✅ runs here only
   - no prod secrets / no prod DB network
   - egress allow-list, resource caps, timeout
            │  stdout/stderr/exit captured (redacted)
            ▼
   Audit record (cli_executions / agent_actions) ── owner-visible
```

- **Reuses Phase 2.** The command is dispatched through the existing
  function-calling engine (`src/lib/agent/service.ts`) as a `cli_exec` tool family.
  This gives us the approval gate and audit log for free.
- **The web app never executes commands.** It is only a *broker*: it validates
  policy, mints scoped credentials, hands the job to the sandbox, and records the
  result. This keeps RCE out of the process that holds real secrets.
- **The sandbox is the trust boundary.** It is treated as hostile: even if a
  command is malicious or injected, it must not be able to reach prod data,
  secrets, or other tenants.

---

## 6. Capability-by-capability policy

| Capability | Allowed scope | Guardrails |
|---|---|---|
| **Git** | Operate on a sandbox checkout; push only to feature branches. | Deny force-push to `main`/`master`; deny history rewrites; PR-based merges only. |
| **Repository tasks** | Lint, typecheck, codegen, dependency inspection. | Read-only by default; writes land as a branch/PR for review. |
| **Filesystem** | Read/write **inside the sandbox workspace only**. | No access to host paths, env files, or mounted secrets; path allow-list. |
| **Migration execution** | **Generate** SQL + run against a shadow/branch DB only. | **Never** apply to production. Production apply stays the existing out-of-band, human `supabase db push`. Additive/idempotent review required. |
| **Python** | Run in sandbox with resource caps. | Egress allow-list; no prod creds; dependency pinning; output caps. |
| **Shell** | Allow-listed subcommands only (e.g. `ls`, `cat`, `git`, `node`, `python`). | Deny-list destructive patterns (`rm -rf`, `:(){:|:&};:`, `curl … | sh`, raw `dd`, `mkfs`); no `sudo`; no package installs without review. |

**Migration execution is deliberately the most restricted.** The platform's
current, correct posture is that production migrations are applied by a human,
out-of-band, after review. This design **keeps that** — Phase 4 may *write* a
migration file and validate it against a disposable DB, but production application
is never automated through the agent.

---

## 7. Approval & autonomy integration

- Harmony's autonomy ladder (monitor → recommend → prepare → execute) governs
  *lower-risk* actions. **CLI execution sits above the ladder:** it always
  requires an explicit, per-action owner approval, regardless of the autonomy
  level configured elsewhere. There is no "trust this forever" toggle for shell.
- Approvals are single-use and bound to the exact command + arguments that were
  shown to the owner; changing the command invalidates the approval.
- Approvals expire (e.g. 10 minutes) if not executed.

---

## 8. Proposed data model (not implemented)

Two options; decision deferred to implementation:

- **A — extend `agent_actions`** with a `cli` source and store the command,
  argv, exit code, and redacted output in `result`. Lightweight; reuses existing
  RLS + UI.
- **B — dedicated `cli_executions` table** (owner-scoped RLS, append-only) for
  richer fields (sandbox id, resource usage, egress log, redacted streams).
  Better for forensics.

Either way: owner-scoped RLS, append-only/immutable, token/secret redaction
before persistence, and surfaced in the existing Activity UI.

---

## 9. Rollout plan (each step behind a flag, default-off)

1. **4a — Dry-run / read-only.** `git status`, `diff`, `ls`, `cat` in sandbox.
   Proves the broker + sandbox + audit loop with zero mutation risk.
2. **4b — Reversible repo/filesystem ops** with approval; all writes land as a PR.
3. **4c — Python in sandbox** with resource/egress caps.
4. **4d — Shell allow-list** + migration *generation* (never prod apply).

No step proceeds until the previous one has been validated in a real sandbox.

---

## 10. Blockers & required decisions

Implementation cannot begin safely until the following are decided/provisioned
(these are infrastructure + policy calls only the operator can make):

1. **Sandbox runner.** Where do commands execute? Vercel's serverless/runtime
   **cannot** safely run arbitrary shell. Options: a dedicated container service
   (e.g. E2B, Fly Machines, Modal, Cloud Run jobs) isolated from the prod VPC.
   *Decision required.*
2. **Secrets isolation.** A vault/mechanism to mint short-lived, narrowly-scoped
   creds for tasks, with **zero** access to service-role/Stripe/OAuth secrets.
   *Decision required.*
3. **Egress policy.** Default-deny network egress from the sandbox with a
   per-task allow-list. *Decision required.*
4. **Shadow DB** for migration validation, separate from production. *Decision required.*
5. **Sign-off** on this design (especially §4 principles and §6 policy).

**Recommendation:** keep Phase 4 as design-only until items 1–5 are resolved.
Building any executable command path before then would violate the program's
stated constraints (no regressions, smallest safe changes, owner-scoped security)
and introduce an unbounded RCE surface into a production SaaS.

---

## Appendix — relationship to shipped phases

- **Phase 1 (Memory)** and **Phase 2 (Function Calling)** are live foundations.
  Phase 4 reuses Phase 2's approval gate + audit log rather than inventing a new
  execution path.
- **Phase 3 (Connection dashboard)** is unrelated to execution; it manages
  external integration connections.
- Nothing in this document changes existing behavior; it is a plan.
