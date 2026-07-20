# AIOS Product Architecture

This is the canonical product architecture for AIOS. Other architecture,
roadmap, readiness, marketplace, public website, Subscriber Harmony, and
governance documents must reference this document rather than creating a
competing product model.

## Product Principles

AIOS is built on one product law:

```text
One Universal AIOS Runtime
+ Company Context Envelope
= a company-specific operating system
```

AIOS must not create a separate application codebase for every company template
or customer deployment. Company-specific behavior comes from configuration,
context, governance, and installed capabilities:

- company identity;
- industry;
- branding;
- mission and objectives;
- departments;
- AI workforce configuration;
- skills and workflows;
- knowledge and Julius memory;
- connectors;
- policies and approval rules;
- KPIs and dashboards;
- plan and entitlements.

Human governance is permanent. AIOS can observe, recommend, draft, coordinate,
and execute approved work, but must not bypass tenant boundaries, approvals,
connector readiness, plan/entitlement checks, or auditability.

## Four Product Surfaces

| Surface | Audience | Purpose | Current boundary |
| --- | --- | --- | --- |
| Public AIOS Website | Visitors, prospects, partners, investors, unauthenticated users | Explain AIOS, Harmony, Julius, the workforce, Marketplace, Company Templates, Portable Company, managed services, pricing, docs, and conversion into signup. | Public marketing and education routes. The next Website milestone completes the full public IA. |
| Subscriber Harmony | Authenticated customers | Personal and business operating system: onboarding, company creation/import, Harmony interaction, tasks, goals, notes, projects, workforce deployment, company operations, Marketplace, integrations, approvals, memory, learning, monitoring, support, Portable Company, and multi-company management. | Protected customer product. PR #404 adds Founder visibility and privacy-safe operations dashboards but does not complete every Subscriber Business OS workflow. |
| Founder OS | AIOS Founder/admin only | Operate AIOS, govern Subscriber Harmony, operate the public website and Marketplace, certify listings, monitor customer deployments, manage workforce/releases/incidents/integrations/governance/managed services, and view platform KPIs without exposing private customer content. | Founder-only protected routes. Must never be exposed to subscribers. |
| Customer-Deployed Company Websites and Applications | Customers and their audiences | Future/productized outputs created and maintained by AIOS: public company websites, portals, internal applications, dashboards, and AI-maintained software. | Future layer. Not the public AIOS website and not Subscriber Harmony. |

## Roles and Audiences

- **Visitors/prospects/investors/partners** use the public website.
- **Subscribers/customers** use Subscriber Harmony and any company workspaces
  they own or are authorized to access.
- **Founder/admins** use Founder OS to operate AIOS and see aggregate/customer
  experience readiness without reading private customer content.
- **Customer audiences** use customer-deployed websites and applications once
  that future layer is productized.

## Public-To-Authenticated Customer Journey

Canonical journey:

```text
Visitor
→ Explore AIOS
→ Preview Marketplace/Templates
→ Get Started
→ Signup
→ Verify account
→ Create profile
→ Select use mode
→ Complete guided onboarding
→ Establish company or exploration context
→ Enter Subscriber Harmony
```

First-login use modes:

1. Personal productivity.
2. Build a new company.
3. Connect an existing company.
4. Add AI workers to an existing company.
5. Explore the Marketplace.
6. Hire AIOS managed services.

Returning-user rules:

- One company: open the last active company or personal workspace.
- Multiple companies: open the last active company and show a visible company
  switcher.
- No company: open the personal dashboard with guided company creation.
- Founder/admin: may enter Founder OS, but platform controls must not appear in
  subscriber views.

Marketplace browsing may be allowed immediately after authentication.
Installation/deployment is gated by active account, role, company context,
plan/entitlement, required consent, connector readiness, and approval/risk
rules.

## Personal Harmony Versus Business Harmony

Subscriber Harmony includes both personal and business modes.

- **Personal Harmony** handles personal productivity: tasks, goals, notes,
  memory, learning, personal integrations, approvals, and the operator/chat
  experience.
- **Business Harmony** handles company operations: company creation/import,
  active company context, departments, AI workforce deployment, objectives,
  projects, dashboards, connectors, governance, approvals, Marketplace installs,
  Portable Company, and multi-company switching.

The same protected Harmony shell may serve both modes, but every data access path
must respect user, role, company, plan, consent, and RLS boundaries.

## Company Context Envelope

The Company Context Envelope is the configuration layer that turns the Universal
AIOS Runtime into a company-specific operating system. It contains identity,
brand, mission, industry, objectives, departments, policies, governance,
connector bindings, workforce settings, dashboards, knowledge references,
entitlements, and operating rules.

The envelope carries configuration and knowledge references only. It must never
carry OAuth tokens, refresh tokens, service-role keys, API keys, signed URLs, or
raw credentials.

## Active Company Context

Every company-aware workflow must resolve active company context before
execution:

- current user;
- role and authorization;
- active company;
- plan/entitlement;
- applicable policy and autonomy level;
- connector readiness;
- approval requirement;
- audit target.

If no company exists, Subscriber Harmony remains useful in personal mode and
guides company creation. If multiple companies exist, the active company must be
visible and switchable.

## AI-Operated Departments

AIOS departments are primarily AI-operated business departments under human
governance. They are not empty traditional org labels.

Every department should be modeled as:

- department identity;
- AI lead;
- supporting AI specialists;
- capabilities and skills;
- workflows;
- integrations;
- knowledge;
- objectives;
- KPIs;
- autonomy;
- approval boundaries;
- readiness;
- health.

Examples:

| Department | Lead | Supporting specialists | Example skills/workflows | Example connectors | Governance |
| --- | --- | --- | --- | --- | --- |
| Finance | Ledger | Auditor, Horizon, Aegis | Forecasting, reconciliation, reporting, budgeting, close, budget review, variance alerts | Stripe, QuickBooks, banking/accounting providers | Approval for payments, filings, and high-risk decisions |
| Marketing | Catalyst | Ambassador, Atlas | Campaigns, content, SEO, social media, brand workflows | LinkedIn, X, YouTube, Meta, analytics | Publishing approvals and brand rules |
| Engineering | Mason | Auditor, Aegis, Pulse | Development, testing, deployment, monitoring | GitHub, Vercel, Supabase | PR, CI, preview, and Founder approval boundaries |
| Customer Experience | Ambassador | Harmony, Atlas, Aegis | Support triage, response drafts, escalation, feedback loops | WhatsApp Business, Gmail, Slack, web chat | High-risk/customer-impacting messages require approval |
| Monitoring | Pulse | Auditor, Mason, Aegis | Uptime, failed jobs, connector health, incident routing | Vercel, Supabase, Event Mesh, connector health | Remediation approval by risk |

Human team members may be added later or coexist with AI specialists, but the
default AIOS value proposition is AI-operated departments governed by humans.

## Marketplace Architecture

Marketplace, Company Templates, Company Builder, AI workforce deployment,
capability installation, and company provisioning are first-class AIOS product
capabilities.

The Marketplace has a single model over installable assets. The next Marketplace
milestone should complete the product experience; PR #404 documents the model
and boundaries but does not build full commerce or every storefront workflow.

Official Marketplace categories:

### Build A Company

- Company Templates
- Industry Solutions
- Operating Models
- Governance Packs
- Starter Kits

### AI Departments

- Finance Department led by Ledger
- Marketing Department led by Catalyst
- Engineering Department led by Mason
- Customer Experience led by Ambassador
- Knowledge/Operations led by Atlas
- Monitoring led by Pulse
- Strategy led by Horizon
- Security/Risk led by Aegis
- Quality/Inspection led by Auditor
- Executive orchestration led by Harmony

### AI Workforce

- Individual specialists
- Workforce bundles
- Executive teams
- Industry teams
- Portable Workforce

### Capabilities

- Skills
- Workflows
- Connector Packs
- Dashboards
- Knowledge Packs
- Branding Packs
- Policies and Governance Packs
- Developer Tools

### Professional Services

- Business Systems Audit
- AI Workforce Deployment
- Integration Setup
- Technical Support
- Website Build
- Website Monitoring
- Managed Mason Engineering
- Security Review
- Monthly Harmony Operations
- Emergency Support
- Portable Company Migration

Phased Marketplace work may still include third-party sellers, revenue sharing,
advanced cross-cloud deployment orchestration, customer-generated websites,
complex enterprise tenancy, advanced simulation, and fully automated cloud
migration.

## Company Builder

Company Builder is the guided experience for creating or connecting a company.
It should resolve whether the customer is:

- creating a new company from scratch;
- provisioning from a Company Template;
- connecting/importing an existing company;
- adding AI workers to an existing company;
- exploring Marketplace assets before deployment;
- requesting managed services.

Company Builder should call shared provisioning/import/install services and
write the Company Context Envelope. It must not fork a new company-specific
application codebase.

## Deployment Lifecycle

Canonical deployment lifecycle:

1. Choose personal, company, import, workforce, Marketplace, or managed-service
   path.
2. Establish profile, company context, plan, and consent.
3. Select template, workforce, departments, capabilities, connectors, and
   governance.
4. Run readiness checks.
5. Request approval where risk requires it.
6. Provision the Company Context Envelope and related records.
7. Connect or re-consent external providers.
8. Activate dashboards/workflows.
9. Monitor health and adoption.
10. Learn into Julius and Company Skills.
11. Export, backup, clone, migrate, or deploy through Portable Company when
    needed.

## Portable Workforce

Portable Workforce is the exportable/importable AI workforce configuration for a
company: agents, departments, skills, workflows, governance, approval policy,
connector bindings, and readiness metadata. It is configuration and knowledge,
not credentials.

## Portable Company

Portable Company expands Portable Workforce to a whole deployable company:
Company Context Envelope, Julius memory, Company Skills, derived operating
models, financial/compliance snapshots, and marketplace provisioning references.
It supports export, import, backup, clone, and deployment preparation. Connector
credentials are always re-consented in the target environment.

## Managed Services

AIOS may sell managed services alongside software:

- business systems audit;
- AI workforce deployment;
- integration setup;
- technical support;
- website build and monitoring;
- managed Mason engineering;
- security review;
- monthly Harmony operations;
- emergency support;
- Portable Company migration.

Managed services must be represented truthfully as service engagements, not as
instant fully autonomous software capabilities.

## Customer-Generated Websites And Applications

Customer-generated company websites and applications are a future productized
output created and maintained by AIOS. They are distinct from:

- the public AIOS website;
- Subscriber Harmony;
- Founder OS.

Examples include public company websites, customer portals, internal business
applications, operational dashboards, and AI-maintained software.

The future layer must preserve tenant isolation, governance, deployment
traceability, approval boundaries, and rollback paths.

## Founder OS

Founder OS is the Founder/admin-only operating layer for AIOS itself. It owns:

- platform operations;
- Subscriber Harmony governance;
- public website operations;
- Marketplace operations and listing certification;
- customer deployment monitoring;
- AIOS workforce management;
- releases, incidents, integrations, and governance;
- managed-service engagements;
- aggregate KPIs that do not expose private customer content.

Founder OS is not a customer company operating system and must not be visible to
ordinary subscribers.

## Security And Tenant Boundaries

- Public routes must not expose protected data.
- Subscriber data is owner/company scoped through Supabase RLS and server-side
  authorization.
- Founder dashboards aggregate by default and must not display private notes,
  prompts, messages, memories, files, customer email/calendar content, phone
  numbers, connector tokens, or raw credentials.
- Company bundles/export/import carry configuration and knowledge only.
- Integration credentials are encrypted/stored through connector systems and
  re-consented per target environment.
- External writes and risky operations remain approval-gated.
- AirBid remains a separate company, registry, brand, memory, and operating
  boundary.

## Canonical Workforce

The code source of truth is `src/lib/workforce/registry.ts`. The current
canonical AIOS workforce is:

- Harmony
- Auditor
- Mason
- Catalyst
- Ambassador
- Atlas
- Pulse
- Horizon
- Aegis
- Ledger

Julius is the organizational brain, not an agent card. Atlas is Julius's primary
steward. Historical AirBid or earlier names such as Nexus, Sentinel, Guardian,
Oracle, and Compass must not be introduced into the AIOS workforce unless the
registry and Founder explicitly authorize it.

## Commercial Boundaries

Current commercial surfaces may include subscriptions, managed services, and
configuration-gated integrations. Future commercial work may include
Marketplace commerce, third-party sellers, revenue sharing, advanced
entitlements, customer-generated website/application billing, and enterprise
tenancy.

Do not advertise fake customers, testimonials, revenue, certifications,
analytics, integration connectivity, or deployment automation.

## Phased Implementation Plan

### Current PR #404 Scope

- Preserve Harmony UX corrections.
- Add Founder visibility for Subscriber Harmony and public Website Operations.
- Add privacy-safe KPI/readiness surfaces.
- Correct integration readiness terminology.
- Add a configuration-gated WhatsApp Business Cloud API foundation.
- Establish this canonical product architecture.

### Next Marketplace Milestone

- Complete the Marketplace product experience for the official categories.
- Clarify public Marketplace versus authenticated Marketplace.
- Complete install/deploy/entitlement UX and listing certification workflows.
- Seed verified platform-owned listings where appropriate.
- Do not build unrelated website redesign work.

### Next Public Website Milestone

- Complete public IA and copy for Home, Features, Harmony, Julius, AI Workforce,
  Marketplace, Company Templates, Solutions, Industries, Portable Company,
  Managed Services, Integrations, Pricing, Documentation, Developers, Security,
  Trust Center, Status, Roadmap, About, Contact, Support, Legal, Login, and
  Signup.
- Label roadmap/resource pages truthfully where launch depth is not complete.
- Do not fabricate customers, testimonials, certifications, metrics, or
  integrations.

### Later Product Milestones

- Subscriber Harmony Business OS and onboarding completion.
- Marketplace commerce and entitlements.
- Deployment lifecycle completion.
- Portable Company customer product completion.
- Managed services operations.
- Customer-generated company websites and applications.
- Advanced cloud migration, simulation, enterprise tenancy, and third-party
  marketplace economics.
