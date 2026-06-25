-- ============================================================================
-- AIOS — Semantic Memory
-- pgvector embeddings for the Julius org brain + company-aware personal memory.
--
-- Additive, idempotent, non-destructive. This sets up the STORAGE + retrieval
-- function for semantic recall; the application embedding/retrieval code lands
-- after this migration is applied. The Julius/memory services already degrade
-- gracefully, so applying this changes no behavior until that code ships.
--
-- DIMENSION NOTE: vector(1536) matches OpenAI text-embedding-3-small / ada-002.
-- If you embed with a different model, change 1536 to that model's dimension in
-- BOTH the column definitions and match_julius_entries BEFORE applying.
-- ============================================================================

-- pgvector — similarity search (supported on Supabase).
create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- Julius org brain: embedding column + ANN index for semantic recall.
-- ---------------------------------------------------------------------------
alter table public.julius_entries
  add column if not exists embedding vector(1536);

create index if not exists julius_entries_embedding_idx
  on public.julius_entries using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ---------------------------------------------------------------------------
-- Personal memory: optional company scope (company-aware memory) + embedding.
-- company_id is NULLABLE so existing user-private memories are unaffected.
-- ---------------------------------------------------------------------------
alter table public.memories
  add column if not exists company_id uuid
    references public.companies(id) on delete set null;

create index if not exists memories_user_company_idx
  on public.memories (user_id, company_id);

alter table public.memories
  add column if not exists embedding vector(1536);

create index if not exists memories_embedding_idx
  on public.memories using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ---------------------------------------------------------------------------
-- Semantic search over Julius entries — owner + company scoped.
-- SECURITY INVOKER (default): runs as the caller, so existing RLS on
-- julius_entries still applies; the explicit user/company filters add no new
-- access. Returns cosine similarity (higher = closer).
-- ---------------------------------------------------------------------------
create or replace function public.match_julius_entries(
  query_embedding vector(1536),
  match_user_id uuid,
  match_company_id uuid,
  match_count int default 10
)
returns table (
  id uuid,
  agent text,
  kind text,
  title text,
  content text,
  importance int,
  similarity float
)
language sql
stable
as $$
  select
    e.id,
    e.agent,
    e.kind::text as kind,
    e.title,
    e.content,
    e.importance,
    1 - (e.embedding <=> query_embedding) as similarity
  from public.julius_entries e
  where e.user_id = match_user_id
    and e.company_id = match_company_id
    and e.embedding is not null
  order by e.embedding <=> query_embedding
  limit greatest(1, match_count);
$$;

grant execute on function public.match_julius_entries(vector, uuid, uuid, int)
  to authenticated;
