alter table public.execution_results
  add column if not exists request_id text null,
  add column if not exists correlation_id text null;

create index if not exists execution_results_user_company_request_id_idx
  on public.execution_results (user_id, company_id, request_id)
  where request_id is not null;

create index if not exists execution_results_user_company_execution_id_idx
  on public.execution_results (user_id, company_id, execution_id)
  where execution_id is not null;

create index if not exists execution_results_user_company_correlation_id_idx
  on public.execution_results (user_id, company_id, correlation_id)
  where correlation_id is not null;
