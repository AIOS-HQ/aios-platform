-- Marketplace Production M2B: atomic install state + success evidence persistence.
-- Applies only to governed install success path.

create or replace function public.marketplace_apply_install_with_evidence(
  p_company_id uuid,
  p_item_id uuid,
  p_rows jsonb,
  p_policy_evidence jsonb,
  p_evidence_version text,
  p_evidence_execution_id text,
  p_evidence_request_id text,
  p_evidence_correlation_id text,
  p_reason_code text default 'install_applied'
)
returns table(applied boolean, evidence_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_actor_id text;
  v_evidence_key text;
  v_payload jsonb;
  v_row jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if p_company_id is null or p_item_id is null then
    raise exception 'missing_install_subject' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.companies c where c.id = p_company_id and c.user_id = v_user_id
  ) then
    raise exception 'forbidden_company' using errcode = '42501';
  end if;

  if coalesce(jsonb_typeof(p_rows), '') <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'missing_install_rows' using errcode = '22023';
  end if;

  if coalesce(jsonb_typeof(p_policy_evidence), '') <> 'object' then
    raise exception 'missing_policy_evidence' using errcode = '22023';
  end if;

  v_actor_id := coalesce(p_policy_evidence #>> '{actor,id}', '');
  if v_actor_id = '' or v_actor_id <> v_user_id::text then
    raise exception 'policy_actor_mismatch' using errcode = '22023';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    if coalesce(v_row->>'company_id','')::uuid <> p_company_id then
      raise exception 'install_row_company_mismatch' using errcode = '22023';
    end if;
    if coalesce(v_row->>'user_id','')::uuid <> v_user_id then
      raise exception 'install_row_user_mismatch' using errcode = '22023';
    end if;

    insert into public.company_installations (
      user_id,
      company_id,
      item_id,
      kind,
      installed_version,
      source,
      enabled,
      updated_at
    ) values (
      (v_row->>'user_id')::uuid,
      (v_row->>'company_id')::uuid,
      (v_row->>'item_id')::uuid,
      v_row->>'kind',
      v_row->>'installed_version',
      coalesce(v_row->>'source', 'marketplace_public'),
      coalesce((v_row->>'enabled')::boolean, true),
      coalesce((v_row->>'updated_at')::timestamptz, now())
    )
    on conflict (company_id, item_id)
    do update set
      user_id = excluded.user_id,
      kind = excluded.kind,
      installed_version = excluded.installed_version,
      source = excluded.source,
      enabled = excluded.enabled,
      updated_at = excluded.updated_at;
  end loop;

  v_evidence_key := concat_ws(':',
    'marketplace_install',
    p_company_id::text,
    p_item_id::text,
    coalesce(p_evidence_version, 'latest'),
    p_evidence_execution_id,
    p_evidence_request_id,
    p_evidence_correlation_id,
    'applied',
    p_reason_code
  );

  v_payload := jsonb_build_object(
    'operation', 'marketplace_install',
    'decision', 'applied',
    'reasonCode', p_reason_code,
    'actor', jsonb_build_object(
      'type', coalesce(p_policy_evidence #>> '{actor,type}', 'founder'),
      'id', v_actor_id
    ),
    'companyId', p_company_id,
    'itemId', p_item_id,
    'version', p_evidence_version,
    'executionIdentity', jsonb_build_object(
      'executionId', p_evidence_execution_id,
      'requestId', p_evidence_request_id,
      'correlationId', p_evidence_correlation_id
    ),
    'policyEvidence', p_policy_evidence,
    'decidedAt', now()
  );

  insert into public.agent_autonomy_audit (
    user_id,
    company_id,
    agent_id,
    action,
    target_type,
    target_id,
    status,
    reason_code,
    idempotency_key,
    payload
  ) values (
    v_user_id,
    p_company_id,
    'harmony',
    'marketplace_install',
    'marketplace_item',
    p_item_id::text,
    'applied',
    p_reason_code,
    v_evidence_key,
    v_payload
  )
  on conflict (idempotency_key)
  do update set
    payload = excluded.payload,
    reason_code = excluded.reason_code
  returning id into evidence_id;

  applied := true;
  return next;
end;
$$;

revoke all on function public.marketplace_apply_install_with_evidence(
  uuid,
  uuid,
  jsonb,
  jsonb,
  text,
  text,
  text,
  text,
  text
) from public, anon;

grant execute on function public.marketplace_apply_install_with_evidence(
  uuid,
  uuid,
  jsonb,
  jsonb,
  text,
  text,
  text,
  text,
  text
) to authenticated, service_role;
