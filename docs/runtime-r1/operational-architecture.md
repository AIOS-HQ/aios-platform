# Runtime R1 Operational Architecture

## Runtime Services
- Harmony (control plane)
- Execution API
- Mason Orchestrator
- Julius Validation
- Worker Runtime
- Future Runtime Services (reserved)

## Operational Modes
- Normal operation
- Execution pause
- Read-only advisory mode
- Recovery mode

## Operational Boundaries
- Approval boundary remains mandatory and unchanged.
- No autonomous execution beyond approved policy.

## Service Responsibilities
- Harmony: planning, preview, approval request orchestration.
- Execution API: execution lifecycle entry points and status endpoints.
- Mason: execution orchestration and queue dispatch.
- Julius: validation and quality gate evaluation.
- Worker Runtime: bounded execution tasks.

## Core Dependencies
- Managed Identities + Key Vault
- Service Bus messaging backbone
- Log Analytics / Application Insights / Monitor
- Supabase execution ledger
- GitHub App integration
- Azure AI Foundry integration
