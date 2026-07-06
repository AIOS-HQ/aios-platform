-- ============================================================================
-- Julius Intelligence — additive semantic-retrieval RPCs.
--
-- Extends the existing match_julius_entries (20260625000000_semantic_memory)
-- with two retrieval primitives the org brain did not yet expose:
--   * match_julius_by_entry       — "decisions like this one" (similarity to a
--                                    known entry's stored embedding; excludes it)
--   * match_julius_entries_global — cross-project recall across ALL of a user's
--                                    companies (company filter dropped)
--
-- Both SECURITY INVOKER (default): RLS on julius_entries still governs access;
-- the explicit user/company filters add no new access. Cosine similarity =
-- 1 - (embedding <=> query). Additive + idempotent (create or replace).
-- ============================================================================

-- Similar-to-a-known-entry ("decisions like this one"): uses the source entry's
-- stored embedding, excludes the source, same user + company.
create or replace function public.match_julius_by_entry(
  source_id uuid,
  match_user_id uuid,
  match_company_id uuid,
  match_count int default 10
)
returns table (
  id uuid, agent text, kind text, title text, content text,
  importance int, created_at timestamptz, similarity float
)
language sql stable
as $$
  with src as (
    select embedding from public.julius_entries
    where id = source_id and user_id = match_user_id and company_id = match_company_id
  )
  select e.id, e.agent, e.kind::text, e.title, e.content, e.importance, e.created_at,
         1 - (e.embedding <=> (select embedding from src)) as similarity
  from public.julius_entries e
  where e.user_id = match_user_id
    and e.company_id = match_company_id
    and e.id <> source_id
    and e.embedding is not null
    and (select embedding from src) is not null
  order by e.embedding <=> (select embedding from src)
  limit greatest(1, match_count);
$$;

grant execute on function public.match_julius_by_entry(uuid, uuid, uuid, int) to authenticated;

-- Cross-project / cross-company semantic retrieval: all of a user's companies.
create or replace function public.match_julius_entries_global(
  query_embedding vector(1536),
  match_user_id uuid,
  match_count int default 10
)
returns table (
  id uuid, company_id uuid, agent text, kind text, title text, content text,
  importance int, created_at timestamptz, similarity float
)
language sql stable
as $$
  select e.id, e.company_id, e.agent, e.kind::text, e.title, e.content, e.importance, e.created_at,
         1 - (e.embedding <=> query_embedding) as similarity
  from public.julius_entries e
  where e.user_id = match_user_id
    and e.embedding is not null
  order by e.embedding <=> query_embedding
  limit greatest(1, match_count);
$$;

grant execute on function public.match_julius_entries_global(vector, uuid, int) to authenticated;
