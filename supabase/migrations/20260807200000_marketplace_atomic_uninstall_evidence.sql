-- Marketplace Production M4C-1: atomic uninstall state + success evidence persistence.
-- Applies only to governed uninstall success path.

create or replace function public.marketplace_apply_uninstall_with_evidence(
  p_company_id uuid,
  p_item_id uuid,
  p_policy_evidence jsonb,
  p_evidence_from_version text,
  p_evidence_execution_id text,
  p_evidence_request_id text,
  p_evidence_correlation_id text,
  p_reason_code text default 'uninstall_applied'
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
  v_installed_version text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if p_company_id is null or p_item_id is null then
    raise exception 'missing_uninstall_subject' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.companies c where c.id = p_company_id and c.user_id = v_user_id
  ) then
    raise exception 'forbidden_company' using errcode = '42501';
  end if;

  if coalesce(jsonb_typeof(p_policy_evidence), '') <> 'object' then
    raise exception 'missing_policy_evidence' using errcode = '22023';
  end if;

  v_actor_id := coalesce(p_policy_evidence #>> '{actor,id}', '');
  if v_actor_id = '' or v_actor_id <> v_user_id::text then
    raise exception 'policy_actor_mismatch' using errcode = '22023';
  end if;

  if coalesce(p_policy_evidence #>> '{companyId}', '') <> p_company_id::text then
    raise exception 'policy_company_mismatch' using errcode = '22023';
  end if;
  if coalesce(p_policy_evidence #>> '{subject,itemId}', '') <> p_item_id::text then
    raise exception 'policy_item_mismatch' using errcode = '22023';
  end if;
  if coalesce(p_policy_evidence #>> '{subject,action}', '') <> 'uninstall' then
    raise exception 'policy_action_mismatch' using errcode = '22023';
  end if;

  select ci.installed_version
    into v_installed_version
    from public.company_installations ci
   where ci.user_id = v_user_id
     and ci.company_id = p_company_id
     and ci.item_id = p_item_id;

  if v_installed_version is null then
    raise exception 'uninstall_installation_not_found' using errcode = '22023';
  end if;

  if v_installed_version is distinct from p_evidence_from_version then
    raise exception 'uninstall_transition_conflict' using errcode = '22023';
  end if;

  delete from public.company_installations ci
   where ci.user_id = v_user_id
     and ci.company_id = p_company_id
     and ci.item_id = p_item_id;

  if not found then
    raise exception 'uninstall_installation_scope_mismatch' using errcode = '22023';
  end if;

  v_evidence_key := concat_ws(':',
    'marketplace_uninstall',
    p_company_id::text,
    p_item_id::text,
    coalesce(p_evidence_from_version, 'none'),
    p_evidence_execution_id,
    p_evidence_request_id,
    p_evidence_correlation_id,
    'applied',
    p_reason_code
  );

  v_payload := jsonb_build_object(
    'operation', 'marketplace_uninstall',
    'decision', 'applied',
    'reasonCode', p_reason_code,
    'actor', jsonb_build_object(
      'type', coalesce(p_policy_evidence #>> '{actor,type}', 'founder'),
      'id', v_actor_id
    ),
    'companyId', p_company_id,
    'itemId', p_item_id,
    'fromVersion', p_evidence_from_version,
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
    'marketplace_uninstall',
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

revoke all on function public.marketplace_apply_uninstall_with_evidence(
  uuid,
  uuid,
  jsonb,
  text,
  text,
  text,
  text,
  text
) from public, anon;

grant execute on function public.marketplace_apply_uninstall_with_evidence(
  uuid,
  uuid,
  jsonb,
  text,
  text,
  text,
  text,
  text
) to authenticated, service_role;
