# Personal Brain — design & future AI memory plan

The **Personal Brain** (`personal_brains` table) is a private, per-user knowledge
store. Today it holds plain text entries (manual notes, preferences, and notes
synced via **Save to Brain**). It is intentionally designed to become the
**AI memory layer** for the Life Operator and Life Advisor in a later sprint.

> Embeddings / vector search are **not built yet** — by design, to keep cost and
> complexity low for this build. This document is the plan referenced by
> `supabase/migrations/20260601000100_personal_tables.sql`.

## Current schema (`personal_brains`)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | PK |
| `user_id` | uuid | FK → `auth.users`, RLS-scoped to owner |
| `title` | text | required |
| `content` | text | free text |
| `kind` | enum | `note` / `preference` / `goal` / `manual` |
| `source_id` | uuid | originating note (for `kind = note`) |
| `tags` | text[] | optional |
| `created_at` / `updated_at` | timestamptz | |

Retrieval today is keyword (`ilike`) search, client-filtered on the Brain page.

## Future embedding / vector-search plan (not in this build)

When we add semantic memory:

1. **Enable pgvector** (one-time, in a migration):
   ```sql
   create extension if not exists vector;
   alter table public.personal_brains
     add column if not exists embedding vector(1536);          -- match model dims
   create index if not exists personal_brains_embedding_idx
     on public.personal_brains using hnsw (embedding vector_cosine_ops);
   ```
2. **Embed on write** — in `brain-actions.ts` / `note-actions.ts`, after insert/update,
   generate an embedding via the existing `AIProvider` abstraction (extend it with
   an `embed()` method) and store it. Gate behind `AI_PROVIDER` so it stays no-cost
   when unconfigured.
3. **Semantic retrieval** — add a `match_brain_entries(query_embedding, match_count)`
   SQL function (RLS-safe, `auth.uid()`-scoped) using cosine distance, and call it
   from the Life Operator's `summarize_notes` / `general` paths to ground answers
   in the user's own knowledge (RAG).
4. **Backfill** — a one-off job to embed existing rows.

## Privacy & principles

- **Users own their data** — entries are strictly owner-scoped via RLS; export/delete
  (a recommended next-sprint item) will cover Brain entries.
- **Trust before automation** — embeddings/AI memory remain opt-in (provider-gated);
  nothing is sent to a third party unless a provider key is configured.
- **Cost control** — no embeddings are generated until explicitly enabled.
