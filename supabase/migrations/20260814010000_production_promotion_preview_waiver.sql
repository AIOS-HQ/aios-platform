alter table public.production_promotion_requests
  add column if not exists preview_certification_waiver boolean not null default false,
  add column if not exists preview_certification_waiver_reason text null;

alter table public.production_promotion_requests
  alter column runtime_evidence_id drop not null,
  alter column runtime_artifact_id drop not null;

alter table public.production_promotion_requests
  drop constraint if exists production_promotion_requests_runtime_evidence_id_check,
  drop constraint if exists production_promotion_requests_runtime_artifact_id_check,
  add constraint production_promotion_requests_runtime_evidence_id_check
    check (
      runtime_evidence_id is null
      or (
        btrim(runtime_evidence_id) <> ''
        and lower(runtime_evidence_id) not like '%latest%'
        and lower(runtime_evidence_id) not like '%head%'
        and lower(runtime_evidence_id) <> 'main'
      )
    ),
  add constraint production_promotion_requests_runtime_artifact_id_check
    check (
      runtime_artifact_id is null
      or (
        btrim(runtime_artifact_id) <> ''
        and lower(runtime_artifact_id) not like '%latest%'
        and lower(runtime_artifact_id) not like '%head%'
        and lower(runtime_artifact_id) <> 'main'
      )
    ),
  add constraint production_promotion_requests_preview_waiver_semantics_check
    check (
      (
        preview_certification_waiver = false
        and runtime_evidence_id is not null
        and runtime_artifact_id is not null
        and preview_certification_waiver_reason is null
      )
      or (
        preview_certification_waiver = true
        and runtime_evidence_id is null
        and runtime_artifact_id is null
        and preview_certification_waiver_reason = 'preview_certification_contract_incompatibility'
      )
    );
