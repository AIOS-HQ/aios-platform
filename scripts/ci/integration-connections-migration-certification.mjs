import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const MIGRATIONS = resolve(ROOT, "supabase/migrations");
const FORWARD = resolve(MIGRATIONS, "20260723000000_reconcile_integration_connections.sql");
const PREPARE = resolve(MIGRATIONS, "20260617110000_prepare_integration_connections_reconciliation.sql");
const EARLY = resolve(MIGRATIONS, "20260603000000_integration_connections.sql");
const CONFLICTING_HISTORY = resolve(MIGRATIONS, "20260617120000_add_integration_connections.sql");
const MASON = resolve(MIGRATIONS, "20260717000000_mason_execution_ledger.sql");
const MASON_HOTFIX = resolve(MIGRATIONS, "20260718000000_mason_execution_ledger_hotfix.sql");

const SAFE_DATABASE_PREFIX = "aios_migration_cert_";
const TEST_USER = "11111111-1111-1111-1111-111111111111";
const OTHER_USER = "22222222-2222-2222-2222-222222222222";

function fail(message) {
  throw new Error(message);
}

function assertLocalDatabase() {
  if (process.env.MIGRATION_TEST_ALLOW_LOCAL_POSTGRES !== "true") {
    fail("local_postgres_guard_not_enabled");
  }
  const host = process.env.PGHOST ?? "";
  if (!new Set(["127.0.0.1", "localhost"]).has(host)) fail("non_local_postgres_rejected");
  if ((process.env.PGDATABASE ?? "postgres") !== "postgres") fail("admin_database_must_be_postgres");
  for (const key of Object.keys(process.env)) {
    if (/SUPABASE.*(?:URL|PASSWORD|TOKEN|KEY)/i.test(key) && process.env[key]) {
      fail("persistent_database_environment_rejected");
    }
  }
}

function psql(database, args, options = {}) {
  if (database !== "postgres" && !database.startsWith(SAFE_DATABASE_PREFIX)) {
    fail("unsafe_database_name");
  }
  const result = spawnSync("psql", [
    "-X",
    "--no-psqlrc",
    "--set=ON_ERROR_STOP=1",
    "--quiet",
    `--dbname=${database}`,
    ...args,
  ], {
    cwd: ROOT,
    env: process.env,
    encoding: "utf8",
    input: options.input,
  });
  if (options.expectFailure) return result;
  if (result.status !== 0) {
    const safeError = String(result.stderr || "postgres_command_failed")
      .replace(/postgres(?:ql)?:\/\/\S+/gi, "[REDACTED_DB_URI]")
      .slice(-4000);
    fail(`postgres_command_failed:${safeError}`);
  }
  return result;
}

function sql(database, statement) {
  return psql(database, ["--command", statement]);
}

function file(database, path, options) {
  return psql(database, ["--file", path], options);
}

function createDatabase(name) {
  sql("postgres", `drop database if exists ${name} with (force)`);
  sql("postgres", `create database ${name}`);
  sql(name, `
    create extension if not exists pgcrypto;
    create schema auth;
    create table auth.users (
      id uuid primary key,
      email text,
      raw_user_meta_data jsonb not null default '{}'::jsonb
    );
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create or replace function public.set_updated_at() returns trigger language plpgsql as $$
    begin new.updated_at = now(); return new; end $$;
    insert into auth.users(id) values ('${TEST_USER}'), ('${OTHER_USER}');
  `);
}

function prepareClusterRoles() {
  sql("postgres", `
    do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
  `);
}

function installMason(database) {
  file(database, MASON);
  file(database, MASON_HOTFIX);
}

function assertCanonical(database, expectedProvider, expectedScopes, expectedAccount) {
  sql(database, `
    do $$
    declare
      actual_provider text;
      actual_provider_id text;
      actual_scopes text;
      actual_scope text;
      actual_account text;
      actual_account_id text;
    begin
      select provider, provider_id, scopes, scope, external_account, external_account_id
      into actual_provider, actual_provider_id, actual_scopes, actual_scope, actual_account, actual_account_id
      from public.integration_connections where user_id = '${TEST_USER}';
      if actual_provider is distinct from '${expectedProvider}' or actual_provider_id is distinct from '${expectedProvider}' then
        raise exception 'provider_not_preserved';
      end if;
      if actual_scopes is distinct from ${expectedScopes === null ? "null" : `'${expectedScopes}'`}
        or actual_scope is distinct from ${expectedScopes === null ? "null" : `'${expectedScopes}'`} then
        raise exception 'scopes_not_preserved';
      end if;
      if actual_account is distinct from ${expectedAccount === null ? "null" : `'${expectedAccount}'`}
        or actual_account_id is distinct from ${expectedAccount === null ? "null" : `'${expectedAccount}'`} then
        raise exception 'external_account_not_preserved';
      end if;
      if not exists (
        select 1 from pg_constraint where conrelid = 'public.integration_connections'::regclass
          and contype = 'u' and pg_get_constraintdef(oid) = 'UNIQUE (user_id, provider)'
      ) then raise exception 'canonical_unique_constraint_missing'; end if;
      if not exists (
        select 1 from pg_constraint where conrelid = 'public.integration_connections'::regclass
          and conname = 'integration_connections_provider_mirror_check'
      ) then raise exception 'mirror_check_missing'; end if;
      if not exists (
        select 1 from pg_policies where schemaname = 'public' and tablename = 'integration_connections'
          and policyname = 'owner_select'
      ) then raise exception 'owner_select_policy_missing'; end if;
      if exists (
        select 1 from pg_policies where schemaname = 'public' and tablename = 'integration_connections'
          and cmd in ('INSERT', 'UPDATE', 'DELETE')
      ) then raise exception 'unexpected_authenticated_write_policy'; end if;
      if not has_column_privilege('authenticated', 'public.integration_connections', 'provider', 'SELECT')
        or not has_column_privilege('authenticated', 'public.integration_connections', 'user_id', 'SELECT')
        or has_column_privilege('authenticated', 'public.integration_connections', 'access_token', 'SELECT')
        or has_table_privilege('authenticated', 'public.integration_connections', 'INSERT')
        or has_table_privilege('authenticated', 'public.integration_connections', 'UPDATE')
        or has_table_privilege('authenticated', 'public.integration_connections', 'DELETE') then
        raise exception 'integration_connection_grants_incorrect';
      end if;
      if not has_table_privilege('authenticated', 'public.mason_execution_events', 'SELECT')
        or not has_table_privilege('authenticated', 'public.mason_execution_events', 'INSERT')
        or has_table_privilege('authenticated', 'public.mason_execution_events', 'UPDATE')
        or has_table_privilege('authenticated', 'public.mason_execution_events', 'DELETE') then
        raise exception 'mason_ledger_grants_incorrect';
      end if;
    end $$;

    set role authenticated;
    set request.jwt.claim.sub = '${TEST_USER}';
    do $$ begin
      if (select count(*) from public.integration_connections) <> 1 then
        raise exception 'owner_rls_scope_failed';
      end if;
    end $$;
    reset role;
  `);
}

function earlierSchema(database) {
  file(database, EARLY);
  sql(database, `
    insert into public.integration_connections(
      user_id, provider, status, scopes, external_account, access_token, refresh_token
    ) values (
      '${TEST_USER}', 'github', 'connected', 'read:user repo', 'AIOS-HQ', 'enc:v1:test', null
    );
    insert into public.integration_connections(user_id, provider, status)
    values ('${OTHER_USER}', 'github', 'connected');
  `);
}

function laterSchema(database) {
  sql(database, `
    create table public.integration_connections (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id) on delete cascade,
      provider_id text not null,
      access_token text,
      refresh_token text,
      expires_at timestamptz,
      scope text,
      external_account_id text,
      metadata jsonb not null default '{}'::jsonb,
      connected_at timestamptz not null default now(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (user_id, provider_id)
    );
    insert into public.integration_connections(user_id, provider_id, scope, external_account_id, access_token)
    values ('${TEST_USER}', 'youtube', 'youtube.upload', 'channel-1', 'enc:v1:test');
  `);
}

function mixedSchema(database, conflict = false) {
  sql(database, `
    create table public.integration_connections (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id) on delete cascade,
      provider text not null,
      provider_id text not null,
      status text not null default 'connected',
      scopes text,
      scope text,
      external_account text,
      external_account_id text,
      access_token text,
      refresh_token text,
      expires_at timestamptz,
      metadata jsonb default '{}'::jsonb,
      connected_at timestamptz default now(),
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
    create index integration_connections_user_provider_idx
      on public.integration_connections(user_id, provider_id);
    alter table public.integration_connections enable row level security;
    create policy "Users can view own integration connections" on public.integration_connections
      for select to authenticated using (auth.uid() = user_id);
    insert into public.integration_connections(
      user_id, provider, provider_id, scopes, scope, external_account, external_account_id, access_token
    ) values (
      '${TEST_USER}', 'github', '${conflict ? "youtube" : "github"}',
      'read:user repo', 'read:user repo', 'AIOS-HQ', 'AIOS-HQ', 'enc:v1:test'
    );
  `);
}

function runScenario(name, setup, expected) {
  const database = `${SAFE_DATABASE_PREFIX}${name}`;
  createDatabase(database);
  try {
    setup(database);
    installMason(database);
    file(database, FORWARD);
    assertCanonical(database, ...expected);
    file(database, FORWARD);
    assertCanonical(database, ...expected);
  } finally {
    sql("postgres", `drop database if exists ${database} with (force)`);
  }
}

function runFocusedCleanHistory() {
  const database = `${SAFE_DATABASE_PREFIX}clean_history`;
  createDatabase(database);
  try {
    file(database, resolve(MIGRATIONS, "20260601000000_profiles_and_roles.sql"));
    file(database, EARLY);
    file(database, PREPARE);
    file(database, CONFLICTING_HISTORY);
    installMason(database);
    file(database, FORWARD);
    sql(database, `
      insert into public.integration_connections(
        user_id, provider, provider_id, status, scopes, scope, external_account, external_account_id
      ) values (
        '${TEST_USER}', 'github', 'github', 'connected',
        'read:user repo', 'read:user repo', 'AIOS-HQ', 'AIOS-HQ'
      );
    `);
    assertCanonical(database, "github", "read:user repo", "AIOS-HQ");
  } finally {
    sql("postgres", `drop database if exists ${database} with (force)`);
  }
}

function runConflictScenario() {
  const database = `${SAFE_DATABASE_PREFIX}conflict`;
  createDatabase(database);
  try {
    mixedSchema(database, true);
    installMason(database);
    const result = file(database, FORWARD, { expectFailure: true });
    if (result.status === 0 || !String(result.stderr).includes("integration_connections_conflicting_provider_values")) {
      fail("conflicting_values_did_not_fail_closed");
    }
  } finally {
    sql("postgres", `drop database if exists ${database} with (force)`);
  }
}

function main() {
  assertLocalDatabase();
  const ordered = readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort();
  if (!ordered.includes("20260617110000_prepare_integration_connections_reconciliation.sql")
    || !ordered.includes("20260723000000_reconcile_integration_connections.sql")) {
    fail("migration_files_missing");
  }
  prepareClusterRoles();
  runFocusedCleanHistory();
  runScenario("earlier", earlierSchema, ["github", "read:user repo", "AIOS-HQ"]);
  runScenario("later", laterSchema, ["youtube", "youtube.upload", "channel-1"]);
  runScenario("mixed", (database) => mixedSchema(database, false), ["github", "read:user repo", "AIOS-HQ"]);
  runConflictScenario();
  console.info("integration_connections_migration_certification=passed");
}

main();
