-- Marketplace Production M4 boundary enforcement for rollback/uninstall RPCs.

create or replace function public.marketplace_semver_parts(p_version text)
returns table(major int, minor int, patch int, prerelease text)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_clean text;
  v_pre text;
  v_parts text[];
  v_dash_pos int;
begin
  if p_version is null or btrim(p_version) = '' then
    raise exception 'invalid_semver' using errcode = '22023';
  end if;

  if p_version !~ '^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$' then
    raise exception 'invalid_semver' using errcode = '22023';
  end if;

  v_clean := split_part(p_version, '+', 1);
  v_dash_pos := strpos(v_clean, '-');
  if v_dash_pos > 0 then
    v_pre := substring(v_clean from v_dash_pos + 1);
    v_clean := substring(v_clean from 1 for v_dash_pos - 1);
  else
    v_pre := null;
  end if;
  v_parts := string_to_array(v_clean, '.');

  major := v_parts[1]::int;
  minor := v_parts[2]::int;
  patch := v_parts[3]::int;
  prerelease := v_pre;
  return next;
end;
$$;

create or replace function public.marketplace_semver_compare(a text, b text)
returns int
language plpgsql
immutable
set search_path = ''
as $$
declare
  pa record;
  pb record;
  ai text[];
  bi text[];
  i int;
  xa text;
  xb text;
  na int;
  nb int;
begin
  select * into pa from public.marketplace_semver_parts(a);
  select * into pb from public.marketplace_semver_parts(b);

  if pa.major <> pb.major then return case when pa.major > pb.major then 1 else -1 end; end if;
  if pa.minor <> pb.minor then return case when pa.minor > pb.minor then 1 else -1 end; end if;
  if pa.patch <> pb.patch then return case when pa.patch > pb.patch then 1 else -1 end; end if;

  if pa.prerelease is null and pb.prerelease is null then return 0; end if;
  if pa.prerelease is null then return 1; end if;
  if pb.prerelease is null then return -1; end if;

  ai := string_to_array(pa.prerelease, '.');
  bi := string_to_array(pb.prerelease, '.');

  for i in 1..greatest(array_length(ai,1), array_length(bi,1)) loop
    xa := ai[i];
    xb := bi[i];

    if xa is null then return -1; end if;
    if xb is null then return 1; end if;

    if xa ~ '^[0-9]+$' and xb ~ '^[0-9]+$' then
      na := xa::int;
      nb := xb::int;
      if na <> nb then return case when na > nb then 1 else -1 end; end if;
    elsif xa ~ '^[0-9]+$' then
      return -1;
    elsif xb ~ '^[0-9]+$' then
      return 1;
    elsif xa <> xb then
      return case when xa > xb then 1 else -1 end;
    end if;
  end loop;

  return 0;
end;
$$;

create or replace function public.marketplace_semver_satisfies(p_version text, p_range text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_group text;
  v_token text;
  v_comparators text[];
  v_cmp int;
  v_target text;
  v_ok boolean;
  v_version_parts record;
  v_target_parts record;
  v_wild text[];
begin
  perform public.marketplace_semver_parts(p_version);

  for v_group in
    select btrim(value)
    from regexp_split_to_table(coalesce(p_range, ''), '\s*\|\|\s*') as value
  loop
    v_comparators := regexp_split_to_array(v_group, '\s+');
    v_ok := true;

    if v_comparators is null or array_length(v_comparators, 1) is null then
      return true;
    end if;

    foreach v_token in array v_comparators
    loop
      v_token := btrim(v_token);
      if v_token = '' then
        continue;
      end if;

      if v_token in ('*', 'x', 'X') then
        continue;
      elsif v_token ~ '^[0-9]+\.(x|X|\*)$' then
        v_wild := string_to_array(v_token, '.');
        select * into v_version_parts from public.marketplace_semver_parts(p_version);
        if v_version_parts.major <> v_wild[1]::int then
          v_ok := false;
          exit;
        end if;
      elsif v_token ~ '^[0-9]+\.[0-9]+\.(x|X|\*)$' then
        v_wild := string_to_array(v_token, '.');
        select * into v_version_parts from public.marketplace_semver_parts(p_version);
        if v_version_parts.major <> v_wild[1]::int or v_version_parts.minor <> v_wild[2]::int then
          v_ok := false;
          exit;
        end if;
      elsif left(v_token, 1) = '^' then
        v_target := btrim(substring(v_token from 2));
        perform public.marketplace_semver_parts(v_target);
        v_cmp := public.marketplace_semver_compare(p_version, v_target);
        if v_cmp < 0 then
          v_ok := false;
          exit;
        end if;
        select * into v_version_parts from public.marketplace_semver_parts(p_version);
        select * into v_target_parts from public.marketplace_semver_parts(v_target);
        if v_target_parts.major > 0 then
          if v_version_parts.major <> v_target_parts.major then
            v_ok := false;
            exit;
          end if;
        elsif v_target_parts.minor > 0 then
          if v_version_parts.major <> 0 or v_version_parts.minor <> v_target_parts.minor then
            v_ok := false;
            exit;
          end if;
        else
          if v_version_parts.major <> 0 or v_version_parts.minor <> 0 or v_version_parts.patch <> v_target_parts.patch then
            v_ok := false;
            exit;
          end if;
        end if;
      elsif left(v_token, 1) = '~' then
        v_target := btrim(substring(v_token from 2));
        perform public.marketplace_semver_parts(v_target);
        v_cmp := public.marketplace_semver_compare(p_version, v_target);
        if v_cmp < 0 then
          v_ok := false;
          exit;
        end if;
        select * into v_version_parts from public.marketplace_semver_parts(p_version);
        select * into v_target_parts from public.marketplace_semver_parts(v_target);
        if v_version_parts.major <> v_target_parts.major or v_version_parts.minor <> v_target_parts.minor then
          v_ok := false;
          exit;
        end if;
      elsif v_token ~ '^(>=|<=|>|<|=).+$' then
        if v_token like '>=%' then
          v_target := btrim(substring(v_token from 3));
          perform public.marketplace_semver_parts(v_target);
          if public.marketplace_semver_compare(p_version, v_target) < 0 then
            v_ok := false;
            exit;
          end if;
        elsif v_token like '<=%' then
          v_target := btrim(substring(v_token from 3));
          perform public.marketplace_semver_parts(v_target);
          if public.marketplace_semver_compare(p_version, v_target) > 0 then
            v_ok := false;
            exit;
          end if;
        elsif v_token like '>%' then
          v_target := btrim(substring(v_token from 2));
          perform public.marketplace_semver_parts(v_target);
          if public.marketplace_semver_compare(p_version, v_target) <= 0 then
            v_ok := false;
            exit;
          end if;
        elsif v_token like '<%' then
          v_target := btrim(substring(v_token from 2));
          perform public.marketplace_semver_parts(v_target);
          if public.marketplace_semver_compare(p_version, v_target) >= 0 then
            v_ok := false;
            exit;
          end if;
        elsif v_token like '=%' then
          v_target := btrim(substring(v_token from 2));
          perform public.marketplace_semver_parts(v_target);
          if public.marketplace_semver_compare(p_version, v_target) <> 0 then
            v_ok := false;
            exit;
          end if;
        end if;
      else
        perform public.marketplace_semver_parts(v_token);
        if public.marketplace_semver_compare(p_version, v_token) <> 0 then
          v_ok := false;
          exit;
        end if;
      end if;
    end loop;

    if v_ok then
      return true;
    end if;
  end loop;

  return false;
exception
  when others then
    return false;
end;
$$;

create or replace function public.marketplace_timestamptz_is_valid(p_value text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_timestamp timestamptz;
begin
  if p_value is null or btrim(p_value) = '' then
    return false;
  end if;

  begin
    v_timestamp := p_value::timestamptz;
    return true;
  exception
    when others then
      return false;
  end;
end;
$$;

create or replace function public.marketplace_apply_rollback_with_evidence(
  p_company_id uuid,
  p_item_id uuid,
  p_to_version text,
  p_policy_evidence jsonb,
  p_evidence_from_version text,
  p_evidence_to_version text,
  p_evidence_execution_id text,
  p_evidence_request_id text,
  p_evidence_correlation_id text,
  p_reason_code text default 'rollback_applied'
)
returns table(applied boolean, evidence_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_actor_id text;
  v_actor_type text;
  v_agent_id text;
  v_subject_kind text;
  v_installed_version text;
  v_evidence_key text;
  v_payload jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'unauthenticated' using errcode='42501'; end if;
  if p_company_id is null or p_item_id is null then raise exception 'missing_rollback_subject' using errcode='22023'; end if;

  if not exists (select 1 from public.companies c where c.id = p_company_id and c.user_id = v_user_id) then
    raise exception 'forbidden_company' using errcode='42501';
  end if;

  if coalesce(jsonb_typeof(p_policy_evidence),'') <> 'object' then raise exception 'missing_policy_evidence' using errcode='22023'; end if;
  if coalesce(p_policy_evidence->>'decision','') <> 'allow' then raise exception 'policy_denied' using errcode='22023'; end if;
  if not public.marketplace_timestamptz_is_valid(p_policy_evidence->>'approvedAt')
    or not public.marketplace_timestamptz_is_valid(p_policy_evidence->>'evaluatedAt') then
    raise exception 'malformed_policy_evidence' using errcode='22023';
  end if;
  if p_policy_evidence ? 'expiresAt' then
    if not public.marketplace_timestamptz_is_valid(p_policy_evidence->>'expiresAt') then
      raise exception 'malformed_policy_evidence' using errcode='22023';
    end if;
    if (p_policy_evidence->>'expiresAt')::timestamptz < now() then
      raise exception 'stale_policy_evidence' using errcode='22023';
    end if;
  end if;

  v_actor_id := coalesce(p_policy_evidence #>> '{actor,id}','');
  v_actor_type := coalesce(p_policy_evidence #>> '{actor,type}','');
  v_agent_id := coalesce(p_policy_evidence #>> '{agent,id}','');
  v_subject_kind := coalesce(p_policy_evidence #>> '{subject,kind}','');

  if v_actor_type <> 'founder' or v_actor_id <> v_user_id::text then raise exception 'policy_actor_mismatch' using errcode='22023'; end if;
  if v_agent_id <> 'harmony' then raise exception 'policy_agent_mismatch' using errcode='22023'; end if;
  if coalesce(p_policy_evidence->>'companyId','') <> p_company_id::text then raise exception 'policy_company_mismatch' using errcode='22023'; end if;
  if coalesce(p_policy_evidence #>> '{subject,itemId}','') <> p_item_id::text then raise exception 'policy_item_mismatch' using errcode='22023'; end if;
  if coalesce(p_policy_evidence #>> '{subject,action}','') <> 'rollback' then raise exception 'policy_action_mismatch' using errcode='22023'; end if;
  if v_subject_kind <> 'marketplace_install' then raise exception 'policy_subject_kind_mismatch' using errcode='22023'; end if;

  if coalesce(p_evidence_execution_id,'') = '' or coalesce(p_evidence_request_id,'') = '' or coalesce(p_evidence_correlation_id,'') = '' then
    raise exception 'missing_execution_identity' using errcode='22023';
  end if;
  if coalesce(p_policy_evidence #>> '{executionIdentity,executionId}','') <> p_evidence_execution_id then raise exception 'execution_identity_mismatch' using errcode='22023'; end if;
  if coalesce(p_policy_evidence #>> '{executionIdentity,requestId}','') <> p_evidence_request_id then raise exception 'execution_identity_mismatch' using errcode='22023'; end if;
  if coalesce(p_policy_evidence #>> '{executionIdentity,correlationId}','') <> p_evidence_correlation_id then raise exception 'execution_identity_mismatch' using errcode='22023'; end if;

  if coalesce(p_to_version,'') = '' or coalesce(p_evidence_to_version,'') = '' or coalesce(p_evidence_from_version,'') = '' then
    raise exception 'missing_rollback_transition' using errcode='22023';
  end if;

  perform public.marketplace_semver_parts(p_evidence_from_version);
  perform public.marketplace_semver_parts(p_evidence_to_version);
  perform public.marketplace_semver_parts(p_to_version);

  if coalesce(p_policy_evidence #>> '{subject,fromVersion}','') <> p_evidence_from_version then raise exception 'policy_transition_mismatch' using errcode='22023'; end if;
  if coalesce(p_policy_evidence #>> '{subject,toVersion}','') <> p_evidence_to_version then raise exception 'policy_transition_mismatch' using errcode='22023'; end if;
  if p_to_version is distinct from p_evidence_to_version then raise exception 'rollback_target_mismatch' using errcode='22023'; end if;

  if not exists (
    select 1
      from public.marketplace_item_versions v
     where v.item_id = p_item_id
       and v.version = p_to_version
  ) then
    raise exception 'rollback_target_not_found' using errcode='22023';
  end if;

  select ci.installed_version
    into v_installed_version
    from public.company_installations ci
   where ci.user_id = v_user_id and ci.company_id = p_company_id and ci.item_id = p_item_id;

  if v_installed_version is null then raise exception 'rollback_installation_not_found' using errcode='22023'; end if;
  if v_installed_version is distinct from p_evidence_from_version then raise exception 'rollback_transition_conflict' using errcode='22023'; end if;
  if public.marketplace_semver_compare(p_to_version, v_installed_version) >= 0 then raise exception 'rollback_target_not_older' using errcode='22023'; end if;

  if exists (
    select 1
      from public.marketplace_item_versions v
      join lateral jsonb_array_elements(coalesce(v.dependencies, '[]'::jsonb)) dep on true
      left join public.company_installations dep_ci
        on dep_ci.user_id = v_user_id
       and dep_ci.company_id = p_company_id
       and dep_ci.item_id::text = coalesce(dep->>'itemId', '')
     where v.item_id = p_item_id
       and v.version = p_to_version
       and (
         dep_ci.item_id is null
        or not public.marketplace_semver_satisfies(dep_ci.installed_version, dep->>'range')
       )
  ) then
    raise exception 'rollback_dependency_conflict' using errcode='22023';
  end if;

  update public.company_installations
     set installed_version = p_to_version,
         updated_at = now()
   where user_id = v_user_id and company_id = p_company_id and item_id = p_item_id;

  if not found then raise exception 'rollback_installation_scope_mismatch' using errcode='22023'; end if;

  v_evidence_key := concat_ws(':','marketplace_rollback',p_company_id::text,p_item_id::text,coalesce(p_evidence_from_version,'none'),coalesce(p_evidence_to_version,'none'),p_evidence_execution_id,p_evidence_request_id,p_evidence_correlation_id,'applied',p_reason_code);

  v_payload := jsonb_build_object(
    'operation','marketplace_rollback','decision','applied','reasonCode',p_reason_code,
    'actor',jsonb_build_object('type',v_actor_type,'id',v_actor_id),
    'companyId',p_company_id,'itemId',p_item_id,'fromVersion',p_evidence_from_version,'toVersion',p_evidence_to_version,
    'executionIdentity',jsonb_build_object('executionId',p_evidence_execution_id,'requestId',p_evidence_request_id,'correlationId',p_evidence_correlation_id),
    'policyEvidence',p_policy_evidence,'decidedAt',now()
  );

  insert into public.agent_autonomy_audit (
    user_id, company_id, agent, action, decision,
    agent_id, target_type, target_id, status, reason_code,
    operation, reason, actor_user_id, policy_key, payload,
    idempotency_key
  ) values (
    v_user_id, p_company_id, 'harmony', 'marketplace_rollback', 'applied',
    'harmony', 'marketplace_item', p_item_id::text, 'applied', p_reason_code,
    'marketplace_rollback', p_reason_code, v_user_id, v_evidence_key, v_payload,
    v_evidence_key
  )
  on conflict (idempotency_key)
  do update set payload = excluded.payload, reason_code = excluded.reason_code, reason = excluded.reason
  returning id into evidence_id;

  applied := true;
  return next;
end;
$$;

revoke all on function public.marketplace_apply_rollback_with_evidence(
  uuid, uuid, text, jsonb, text, text, text, text, text, text
) from public, anon;

grant execute on function public.marketplace_apply_rollback_with_evidence(
  uuid, uuid, text, jsonb, text, text, text, text, text, text
) to authenticated, service_role;

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
  v_actor_type text;
  v_agent_id text;
  v_subject_kind text;
  v_installed_version text;
  v_evidence_key text;
  v_payload jsonb;
  v_has_dependents boolean;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'unauthenticated' using errcode='42501'; end if;
  if p_company_id is null or p_item_id is null then raise exception 'missing_uninstall_subject' using errcode='22023'; end if;

  if not exists (select 1 from public.companies c where c.id = p_company_id and c.user_id = v_user_id) then
    raise exception 'forbidden_company' using errcode='42501';
  end if;

  if coalesce(jsonb_typeof(p_policy_evidence),'') <> 'object' then raise exception 'missing_policy_evidence' using errcode='22023'; end if;
  if coalesce(p_policy_evidence->>'decision','') <> 'allow' then raise exception 'policy_denied' using errcode='22023'; end if;
  if not public.marketplace_timestamptz_is_valid(p_policy_evidence->>'approvedAt')
    or not public.marketplace_timestamptz_is_valid(p_policy_evidence->>'evaluatedAt') then
    raise exception 'malformed_policy_evidence' using errcode='22023';
  end if;
  if p_policy_evidence ? 'expiresAt' then
    if not public.marketplace_timestamptz_is_valid(p_policy_evidence->>'expiresAt') then
      raise exception 'malformed_policy_evidence' using errcode='22023';
    end if;
    if (p_policy_evidence->>'expiresAt')::timestamptz < now() then
      raise exception 'stale_policy_evidence' using errcode='22023';
    end if;
  end if;

  v_actor_id := coalesce(p_policy_evidence #>> '{actor,id}','');
  v_actor_type := coalesce(p_policy_evidence #>> '{actor,type}','');
  v_agent_id := coalesce(p_policy_evidence #>> '{agent,id}','');
  v_subject_kind := coalesce(p_policy_evidence #>> '{subject,kind}','');

  if v_actor_type <> 'founder' or v_actor_id <> v_user_id::text then raise exception 'policy_actor_mismatch' using errcode='22023'; end if;
  if v_agent_id <> 'harmony' then raise exception 'policy_agent_mismatch' using errcode='22023'; end if;
  if coalesce(p_policy_evidence->>'companyId','') <> p_company_id::text then raise exception 'policy_company_mismatch' using errcode='22023'; end if;
  if coalesce(p_policy_evidence #>> '{subject,itemId}','') <> p_item_id::text then raise exception 'policy_item_mismatch' using errcode='22023'; end if;
  if coalesce(p_policy_evidence #>> '{subject,action}','') <> 'uninstall' then raise exception 'policy_action_mismatch' using errcode='22023'; end if;
  if v_subject_kind <> 'marketplace_install' then raise exception 'policy_subject_kind_mismatch' using errcode='22023'; end if;

  if coalesce(p_evidence_execution_id,'') = '' or coalesce(p_evidence_request_id,'') = '' or coalesce(p_evidence_correlation_id,'') = '' then
    raise exception 'missing_execution_identity' using errcode='22023';
  end if;
  if coalesce(p_policy_evidence #>> '{executionIdentity,executionId}','') <> p_evidence_execution_id then raise exception 'execution_identity_mismatch' using errcode='22023'; end if;
  if coalesce(p_policy_evidence #>> '{executionIdentity,requestId}','') <> p_evidence_request_id then raise exception 'execution_identity_mismatch' using errcode='22023'; end if;
  if coalesce(p_policy_evidence #>> '{executionIdentity,correlationId}','') <> p_evidence_correlation_id then raise exception 'execution_identity_mismatch' using errcode='22023'; end if;

  select ci.installed_version
    into v_installed_version
    from public.company_installations ci
   where ci.user_id = v_user_id and ci.company_id = p_company_id and ci.item_id = p_item_id;

  if v_installed_version is null then raise exception 'uninstall_installation_not_found' using errcode='22023'; end if;
  if v_installed_version is distinct from p_evidence_from_version then raise exception 'uninstall_transition_conflict' using errcode='22023'; end if;
  if coalesce(p_policy_evidence #>> '{subject,fromVersion}','') <> p_evidence_from_version then raise exception 'policy_transition_mismatch' using errcode='22023'; end if;

  select exists (
    select 1
      from public.company_installations dep_ci
      join public.marketplace_item_versions dep_v
        on dep_v.item_id = dep_ci.item_id
       and dep_v.version = dep_ci.installed_version
      join lateral jsonb_array_elements(coalesce(dep_v.dependencies, '[]'::jsonb)) dep on true
     where dep_ci.user_id = v_user_id
       and dep_ci.company_id = p_company_id
       and dep_ci.item_id <> p_item_id
       and coalesce(dep->>'itemId','') = p_item_id::text
  ) into v_has_dependents;

  if v_has_dependents then
    raise exception 'uninstall_dependency_conflict' using errcode='22023';
  end if;

  delete from public.company_installations ci
   where ci.user_id = v_user_id and ci.company_id = p_company_id and ci.item_id = p_item_id;

  if not found then raise exception 'uninstall_installation_scope_mismatch' using errcode='22023'; end if;

  v_evidence_key := concat_ws(':','marketplace_uninstall',p_company_id::text,p_item_id::text,coalesce(p_evidence_from_version,'none'),p_evidence_execution_id,p_evidence_request_id,p_evidence_correlation_id,'applied',p_reason_code);

  v_payload := jsonb_build_object(
    'operation','marketplace_uninstall','decision','applied','reasonCode',p_reason_code,
    'actor',jsonb_build_object('type',v_actor_type,'id',v_actor_id),
    'companyId',p_company_id,'itemId',p_item_id,'fromVersion',p_evidence_from_version,
    'executionIdentity',jsonb_build_object('executionId',p_evidence_execution_id,'requestId',p_evidence_request_id,'correlationId',p_evidence_correlation_id),
    'policyEvidence',p_policy_evidence,'decidedAt',now()
  );

  insert into public.agent_autonomy_audit (
    user_id, company_id, agent, action, decision,
    agent_id, target_type, target_id, status, reason_code,
    operation, reason, actor_user_id, policy_key, payload,
    idempotency_key
  ) values (
    v_user_id, p_company_id, 'harmony', 'marketplace_uninstall', 'applied',
    'harmony', 'marketplace_item', p_item_id::text, 'applied', p_reason_code,
    'marketplace_uninstall', p_reason_code, v_user_id, v_evidence_key, v_payload,
    v_evidence_key
  )
  on conflict (idempotency_key)
  do update set payload = excluded.payload, reason_code = excluded.reason_code, reason = excluded.reason
  returning id into evidence_id;

  applied := true;
  return next;
end;
$$;

revoke all on function public.marketplace_apply_uninstall_with_evidence(
  uuid, uuid, jsonb, text, text, text, text, text
) from public, anon;

grant execute on function public.marketplace_apply_uninstall_with_evidence(
  uuid, uuid, jsonb, text, text, text, text, text
) to authenticated, service_role;
