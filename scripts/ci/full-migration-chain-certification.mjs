import { readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const MIGRATIONS = resolve(ROOT, "supabase/migrations");
const FOUNDATION = resolve(MIGRATIONS, "20260705090000_marketplace_persistence_foundation.sql");
const FORWARD = resolve(MIGRATIONS, "20260723100000_reconcile_marketplace_persistence.sql");
const SAFE_DATABASE_PREFIX = "aios_full_migration_cert_";
const TEST_USER = "11111111-1111-1111-1111-111111111111";
const OTHER_USER = "22222222-2222-2222-2222-222222222222";
const TEST_COMPANY = "33333333-3333-3333-3333-333333333333";
const OTHER_COMPANY = "44444444-4444-4444-4444-444444444444";
const TEST_ITEM = "55555555-5555-5555-5555-555555555555";

function fail(message) {
  throw new Error(message);
}

function assertLocalDatabase() {
  if (process.env.MIGRATION_TEST_ALLOW_LOCAL_POSTGRES !== "true") fail("local_postgres_guard_not_enabled");
  if (!new Set(["127.0.0.1", "localhost"]).has(process.env.PGHOST ?? "")) fail("non_local_postgres_rejected");
  if ((process.env.PGDATABASE ?? "postgres") !== "postgres") fail("admin_database_must_be_postgres");
  for (const key of Object.keys(process.env)) {
    if (/SUPABASE.*(?:URL|PASSWORD|TOKEN|KEY)/i.test(key) && process.env[key]) {
      fail("persistent_database_environment_rejected");
    }
  }
}

function psql(database, args, options = {}) {
  if (database !== "postgres" && !database.startsWith(SAFE_DATABASE_PREFIX)) fail("unsafe_database_name");
  const result = spawnSync("psql", [
    "-X", "--no-psqlrc", "--set=ON_ERROR_STOP=1", "--quiet", `--dbname=${database}`, ...args,
  ], { cwd: ROOT, env: process.env, encoding: "utf8", input: options.input });
  if (options.expectFailure) return result;
  if (result.status !== 0) {
    const safeError = String(result.stderr || "postgres_command_failed")
      .replace(/postgres(?:ql)?:\/\/\S+/gi, "[REDACTED_DB_URI]")
      .slice(-5000);
    fail(`postgres_command_failed:${safeError}`);
  }
  return result;
}

function sql(database, statement, options) {
  return psql(database, ["--command", statement], options);
}

function file(database, path, options) {
  const result = psql(database, ["--file", path], { ...options, expectFailure: true });
  if (options?.expectFailure) return result;
  if (result.status !== 0) {
    const safeError = String(result.stderr || "migration_failed")
      .replace(/postgres(?:ql)?:\/\/\S+/gi, "[REDACTED_DB_URI]")
      .slice(-5000);
    fail(`migration_failed:${basename(path)}:${safeError}`);
  }
  return result;
}

function prepareClusterRoles() {
  sql("postgres", `
    do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
  `);
}

function createDatabase(name) {
  sql("postgres", `drop database if exists ${name} with (force)`);
  sql("postgres", `create database ${name}`);
  sql(name, `
    create schema auth;
    create table auth.users (
      id uuid primary key,
      email text,
      raw_user_meta_data jsonb not null default '{}'::jsonb
    );
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create schema storage;
    create table storage.buckets (id text primary key, name text not null, public boolean not null default false);
    create table storage.objects (id text primary key default md5(random()::text), bucket_id text, name text not null);
    alter table storage.objects enable row level security;
    create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
      select string_to_array(name, '/')
    $$;
  `);
}

function dropDatabase(name) {
  sql("postgres", `drop database if exists ${name} with (force)`);
}

function orderedMigrations() {
  return readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort();
}

function assertMarketplaceContract(database) {
  sql(database, `
    do $$
    declare table_name text;
    begin
      foreach table_name in array array[
        'marketplace_items','marketplace_item_versions','marketplace_item_ratings','company_installations'
      ] loop
        if to_regclass('public.' || table_name) is null then
          raise exception using message='missing_marketplace_table_' || table_name;
        end if;
        if not (select relrowsecurity from pg_class where oid=('public.' || table_name)::regclass) then
          raise exception using message='marketplace_rls_disabled_' || table_name;
        end if;
        if not has_table_privilege('authenticated', 'public.' || table_name, 'SELECT') then
          raise exception using message='marketplace_authenticated_select_missing_' || table_name;
        end if;
      end loop;
      if to_regprocedure('public.marketplace_install_counts()') is null then
        raise exception 'marketplace_install_counts_missing';
      end if;
      if not exists (select 1 from pg_constraint where conrelid='public.marketplace_items'::regclass and contype='u' and pg_get_constraintdef(oid)='UNIQUE (slug)') then
        raise exception 'marketplace_slug_unique_missing';
      end if;
      if not exists (select 1 from pg_constraint where conrelid='public.marketplace_item_versions'::regclass and contype='u' and pg_get_constraintdef(oid)='UNIQUE (item_id, version)') then
        raise exception 'marketplace_version_unique_missing';
      end if;
      if not exists (select 1 from pg_constraint where conrelid='public.marketplace_item_ratings'::regclass and contype='u' and pg_get_constraintdef(oid)='UNIQUE (item_id, user_id)') then
        raise exception 'marketplace_rating_unique_missing';
      end if;
      if not exists (select 1 from pg_constraint where conrelid='public.company_installations'::regclass and contype='u' and pg_get_constraintdef(oid)='UNIQUE (company_id, item_id)') then
        raise exception 'marketplace_installation_unique_missing';
      end if;
    end $$;
  `);
}

function assertMarketplaceAuditEvidenceContract(database) {
  sql(database, `
    insert into public.agent_autonomy_audit (
      user_id, company_id, agent, action, decision,
      operation, reason, actor_user_id, policy_key, payload,
      idempotency_key
    ) values (
      '${TEST_USER}', '${TEST_COMPANY}', 'harmony', 'marketplace_install', 'applied',
      'marketplace_install', 'install_applied', '${TEST_USER}',
      'mkt:install:${TEST_COMPANY}:${TEST_ITEM}:1.2.3:exec-1:req-1:corr-1:applied:install_applied',
      jsonb_build_object('itemId','${TEST_ITEM}','decision','applied'),
      'mkt:install:${TEST_COMPANY}:${TEST_ITEM}:1.2.3:exec-1:req-1:corr-1:applied:install_applied'
    );

    insert into public.agent_autonomy_audit (
      user_id, company_id, agent, action, decision,
      operation, reason, actor_user_id, policy_key, payload,
      idempotency_key
    ) values (
      '${TEST_USER}', '${TEST_COMPANY}', 'harmony', 'marketplace_install', 'blocked',
      'marketplace_install', 'missing_policy_decision', '${TEST_USER}',
      'mkt:install:${TEST_COMPANY}:${TEST_ITEM}:1.2.3:exec-2:req-2:corr-2:blocked:missing_policy_decision',
      jsonb_build_object('itemId','${TEST_ITEM}','decision','blocked'),
      'mkt:install:${TEST_COMPANY}:${TEST_ITEM}:1.2.3:exec-2:req-2:corr-2:blocked:missing_policy_decision'
    );

    insert into public.agent_autonomy_audit (
      user_id, company_id, agent, action, decision,
      operation, reason, actor_user_id, policy_key, payload,
      idempotency_key
    ) values (
      '${TEST_USER}', '${TEST_COMPANY}', 'harmony', 'marketplace_update', 'applied',
      'marketplace_update', 'update_applied', '${TEST_USER}',
      'mkt:update:${TEST_COMPANY}:${TEST_ITEM}:1.2.3:2.0.0:exec-3:req-3:corr-3:applied:update_applied',
      jsonb_build_object('itemId','${TEST_ITEM}','decision','applied'),
      'mkt:update:${TEST_COMPANY}:${TEST_ITEM}:1.2.3:2.0.0:exec-3:req-3:corr-3:applied:update_applied'
    ) on conflict (idempotency_key)
      do update set payload = excluded.payload, reason_code = excluded.reason_code;

    insert into public.agent_autonomy_audit (
      user_id, company_id, agent, action, decision,
      operation, reason, actor_user_id, policy_key, payload,
      idempotency_key
    ) values (
      '${TEST_USER}', '${TEST_COMPANY}', 'harmony', 'marketplace_update', 'applied',
      'marketplace_update', 'update_applied', '${TEST_USER}',
      'mkt:update:${TEST_COMPANY}:${TEST_ITEM}:1.2.3:2.0.0:exec-3:req-3:corr-3:applied:update_applied',
      jsonb_build_object('itemId','${TEST_ITEM}','decision','applied','retry',true),
      'mkt:update:${TEST_COMPANY}:${TEST_ITEM}:1.2.3:2.0.0:exec-3:req-3:corr-3:applied:update_applied'
    ) on conflict (idempotency_key)
      do update set payload = excluded.payload, reason_code = excluded.reason_code;

    do $$ begin
      if (select count(*) from public.agent_autonomy_audit where idempotency_key='mkt:update:${TEST_COMPANY}:${TEST_ITEM}:1.2.3:2.0.0:exec-3:req-3:corr-3:applied:update_applied') <> 1 then
        raise exception 'marketplace_audit_duplicate_not_idempotent';
      end if;

      if exists (
        select 1 from public.agent_autonomy_audit
        where operation like 'marketplace_%'
          and (user_id is null or agent is null or action is null or decision is null)
      ) then
        raise exception 'marketplace_audit_legacy_required_fields_missing';
      end if;

      begin
        insert into public.agent_autonomy_audit (
          user_id, company_id, agent, action, decision,
          operation, reason, actor_user_id, policy_key, payload
        ) values (
          '${TEST_USER}', '${TEST_COMPANY}', 'harmony', 'marketplace_install', 'invalid_decision',
          'marketplace_install', 'invalid', '${TEST_USER}',
          'mkt:invalid:${TEST_COMPANY}:${TEST_ITEM}',
          '{}'::jsonb
        );
        raise exception 'marketplace_audit_invalid_decision_was_allowed';
      exception when check_violation then null;
      end;
    end $$;
  `);
}

function assertMarketplaceRls(database) {
  sql(database, `
    insert into auth.users(id,email) values
      ('${TEST_USER}','test@example.invalid'), ('${OTHER_USER}','other@example.invalid')
    on conflict do nothing;
    insert into public.companies(id,user_id,name,slug) values
      ('${TEST_COMPANY}','${TEST_USER}','Test Company','test-company'),
      ('${OTHER_COMPANY}','${OTHER_USER}','Other Company','other-company')
    on conflict do nothing;
    insert into public.marketplace_items(
      id,user_id,company_id,kind,slug,name,description,visibility,verification
    ) values
      ('${TEST_ITEM}','${TEST_USER}','${TEST_COMPANY}','workflow','test-private','Test Private','Private','company_private','unverified'),
      ('66666666-6666-6666-6666-666666666666','${OTHER_USER}','${OTHER_COMPANY}','workflow','other-private','Other Private','Private','company_private','unverified'),
      ('77777777-7777-7777-7777-777777777777','${OTHER_USER}',null,'workflow','other-public','Other Public','Public','marketplace_public','verified')
    on conflict do nothing;

    set role authenticated;
    set request.jwt.claim.sub='${TEST_USER}';
    do $$ begin
      if (select count(*) from public.marketplace_items) <> 2 then
        raise exception 'marketplace_select_rls_failed';
      end if;
    end $$;
    do $$ begin
      begin
        insert into public.marketplace_items(user_id,kind,slug,name,description,visibility,verification)
        values ('${TEST_USER}','workflow','forbidden-public','Forbidden','', 'marketplace_public','verified');
        raise exception 'marketplace_public_self_publish_was_allowed';
      exception when insufficient_privilege or check_violation then null;
      end;
    end $$;
    do $$ begin
      begin
        insert into public.company_installations(user_id,company_id,item_id,kind,installed_version,source)
        values ('${TEST_USER}','${OTHER_COMPANY}','${TEST_ITEM}','workflow','1.0.0','company_private');
        raise exception 'marketplace_cross_company_install_was_allowed';
      exception when insufficient_privilege or check_violation then null;
      end;
    end $$;
    reset role;
  `);
}

function runCompleteHistory() {
  const database = `${SAFE_DATABASE_PREFIX}complete`;
  createDatabase(database);
  try {
    const migrations = orderedMigrations();
    if (migrations.length !== 56) fail(`unexpected_migration_count:${migrations.length}`);
    for (const migration of migrations) file(database, resolve(MIGRATIONS, migration));
    assertMarketplaceContract(database);
    assertMarketplaceRls(database);
    assertMarketplaceAuditEvidenceContract(database);
  } finally {
    dropDatabase(database);
  }
}

function prepareUpgradeDatabase(database) {
  createDatabase(database);
  sql(database, `
    create extension if not exists pgcrypto;
    create or replace function public.set_updated_at() returns trigger language plpgsql as $$
    begin new.updated_at=now(); return new; end $$;
    create table public.companies (
      id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
      name text not null, slug text not null, unique(user_id,slug)
    );
    insert into auth.users(id) values ('${TEST_USER}'),('${OTHER_USER}');
    insert into public.companies(id,user_id,name,slug) values
      ('${TEST_COMPANY}','${TEST_USER}','Test Company','test-company'),
      ('${OTHER_COMPANY}','${OTHER_USER}','Other Company','other-company');
  `);
}

function createHistoricalMarketplace(database, partial = false) {
  sql(database, `
    create table public.marketplace_items (
      id uuid primary key default gen_random_uuid(), user_id uuid not null, company_id uuid,
      kind text not null, slug text not null, name text not null, description text,
      visibility text not null, verification text not null,
      tags text[], created_at timestamptz, updated_at timestamptz
    );
    create table public.marketplace_item_versions (
      id uuid primary key default gen_random_uuid(), item_id uuid not null,
      ${partial ? "" : "user_id uuid,"} version text not null, changelog text,
      checksum text, artifact_ref text, dependencies jsonb, min_runtime text,
      yanked boolean, created_at timestamptz
    );
    create table public.marketplace_item_ratings (
      id uuid primary key default gen_random_uuid(), item_id uuid not null,
      user_id uuid not null, stars smallint not null, comment text, created_at timestamptz
    );
    create table public.company_installations (
      id uuid primary key default gen_random_uuid(), ${partial ? "" : "user_id uuid,"}
      company_id uuid not null, item_id uuid not null, ${partial ? "" : "kind text,"}
      installed_version text not null, ${partial ? "" : "source text,"}
      enabled boolean, installed_at timestamptz, updated_at timestamptz
    );
    insert into public.marketplace_items(
      id,user_id,company_id,kind,slug,name,description,visibility,verification,tags
    ) values ('${TEST_ITEM}','${TEST_USER}','${TEST_COMPANY}','workflow','preserved-item','Preserved','Preserved description','company_private','unverified',array['safe']);
    insert into public.marketplace_item_versions(item_id,${partial ? "" : "user_id,"}version,dependencies,yanked)
    values ('${TEST_ITEM}',${partial ? "" : `'${TEST_USER}',`}'1.2.3','[]'::jsonb,false);
    insert into public.marketplace_item_ratings(item_id,user_id,stars,comment)
    values ('${TEST_ITEM}','${OTHER_USER}',5,'Preserved review');
    insert into public.company_installations(${partial ? "" : "user_id,"}company_id,item_id,${partial ? "" : "kind,"}installed_version,${partial ? "" : "source,"}enabled)
    values (${partial ? "" : `'${TEST_USER}',`}'${TEST_COMPANY}','${TEST_ITEM}',${partial ? "" : "'workflow',"}'1.2.3',${partial ? "" : "'company_private',"}true);
  `);
}

function assertUpgradePreserved(database) {
  assertMarketplaceContract(database);
  sql(database, `
    do $$ begin
      if not exists (select 1 from public.marketplace_items where id='${TEST_ITEM}' and slug='preserved-item' and description='Preserved description' and tags=array['safe']) then
        raise exception 'marketplace_item_not_preserved';
      end if;
      if not exists (select 1 from public.marketplace_item_versions where item_id='${TEST_ITEM}' and user_id='${TEST_USER}' and version='1.2.3') then
        raise exception 'marketplace_version_not_preserved';
      end if;
      if not exists (select 1 from public.marketplace_item_ratings where item_id='${TEST_ITEM}' and user_id='${OTHER_USER}' and stars=5 and comment='Preserved review') then
        raise exception 'marketplace_rating_not_preserved';
      end if;
      if not exists (select 1 from public.company_installations where company_id='${TEST_COMPANY}' and item_id='${TEST_ITEM}' and user_id='${TEST_USER}' and kind='workflow' and source='company_private') then
        raise exception 'marketplace_installation_not_preserved';
      end if;
    end $$;
  `);
}

function runUpgrade(name, setup) {
  const database = `${SAFE_DATABASE_PREFIX}${name}`;
  prepareUpgradeDatabase(database);
  try {
    setup(database);
    file(database, FORWARD);
    assertUpgradePreserved(database);
    file(database, FORWARD);
    assertUpgradePreserved(database);
  } finally {
    dropDatabase(database);
  }
}

function runAbsentUpgrade() {
  const database = `${SAFE_DATABASE_PREFIX}absent`;
  prepareUpgradeDatabase(database);
  try {
    file(database, FOUNDATION);
    file(database, FORWARD);
    assertMarketplaceContract(database);
    file(database, FORWARD);
  } finally {
    dropDatabase(database);
  }
}

function runConflictUpgrade() {
  const database = `${SAFE_DATABASE_PREFIX}conflict`;
  prepareUpgradeDatabase(database);
  try {
    createHistoricalMarketplace(database);
    sql(database, `insert into public.marketplace_items(user_id,kind,slug,name,description,visibility,verification)
      values ('${OTHER_USER}','workflow','preserved-item','Duplicate','', 'company_private','unverified')`);
    const result = file(database, FORWARD, { expectFailure: true });
    if (result.status === 0 || !String(result.stderr).includes("marketplace_duplicate_slugs")) {
      fail("marketplace_conflict_did_not_fail_closed");
    }
  } finally {
    dropDatabase(database);
  }
}

function main() {
  assertLocalDatabase();
  prepareClusterRoles();
  runCompleteHistory();
  runAbsentUpgrade();
  runUpgrade("historical", (database) => createHistoricalMarketplace(database));
  runUpgrade("partial", (database) => createHistoricalMarketplace(database, true));
  runConflictUpgrade();
  console.info("full_migration_chain_certification=passed");
}

main();
