-- Isolated persistence for official ČSÚ / volby.gov.cz imports (KV 2026, MČ Praha 6).
-- Apply only to the dedicated results database, never to the manual-entry store.
-- Source format: https://volby.gov.cz/opendata/kv2026/KV2026_XML.htm (v1.1, 06.10.2026),
-- XSD kv_vysledky_okrsky.xsd. Batches are incremental; a precinct may be resent and the
-- revision with the highest PORADI_ZPRAC wins.
--
-- Every table is append-only: triggers below reject UPDATE, DELETE and TRUNCATE.
-- The application role should additionally be granted only SELECT and INSERT.

-- Every HTTP request to ČSÚ, including "batch not yet available" and failures.
create table if not exists official_fetch_attempts (
  id bigint generated always as identity primary key,
  source_url text not null,
  requested_batch integer check (requested_batch > 0),
  attempted_at timestamptz not null default now(),
  http_status integer,
  outcome text not null check (outcome in ('stored', 'duplicate', 'not_yet_available', 'error')),
  source_sha256 char(64),
  detail text
);

-- One row per stored ČSÚ batch document. The raw bytes are kept verbatim so the hash stays
-- verifiable. Responses that are not a usable batch (HTML error page, truncated download,
-- other batch number) are only logged in official_fetch_attempts and retried.
create table if not exists official_import_runs (
  id uuid primary key,
  source_url text not null,
  batch_number integer not null check (batch_number > 0),
  -- DATUM_CAS_GENEROVANI carries no offset in the source; it is Prague local time.
  source_generated_at_local timestamp not null,
  fetched_at timestamptz not null,
  source_sha256 char(64) not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  raw_payload bytea not null,
  parser_version text not null,
  import_status text not null check (import_status in ('accepted', 'rejected')),
  rejection_reason text,
  national_precincts_total integer,
  national_precincts_processed integer,
  constraint official_import_runs_hash_matches check (encode(sha256(raw_payload), 'hex') = source_sha256),
  constraint official_import_runs_rejection_reason check ((import_status = 'rejected') = (rejection_reason is not null)),
  -- The same bytes are stored once per parser version; re-parsing after a parser fix adds a new run.
  unique (source_sha256, parser_version)
);

create table if not exists official_precinct_revisions (
  id uuid primary key,
  import_run_id uuid not null references official_import_runs(id),
  precinct_number integer not null check (precinct_number between 6001 and 6104),
  processing_order bigint not null check (processing_order >= 0),
  processed_at_local timestamp not null,
  resent boolean not null,
  registered_voters integer not null check (registered_voters >= 0),
  issued_envelopes integer not null check (issued_envelopes >= 0),
  returned_envelopes integer not null check (returned_envelopes >= 0),
  valid_ballots integer not null check (valid_ballots >= 0),
  valid_votes integer not null check (valid_votes >= 0),
  validation_status text not null check (validation_status in ('valid', 'discrepancy')),
  validation_note text,
  unique (import_run_id, precinct_number)
);

create table if not exists official_list_votes (
  precinct_revision_id uuid not null references official_precinct_revisions(id),
  ballot_number integer not null check (ballot_number between 1 and 11),
  votes integer not null check (votes >= 0),
  primary key (precinct_revision_id, ballot_number)
);

-- Candidate/preferential votes arrive later than list votes. These rows stay tied to the
-- exact precinct revision that supplied them; candidate ordering is recomputed, never edited.
create table if not exists official_candidate_votes (
  precinct_revision_id uuid not null references official_precinct_revisions(id),
  ballot_number integer not null check (ballot_number between 1 and 11),
  candidate_order integer not null check (candidate_order >= 1),
  votes integer not null check (votes >= 0),
  primary key (precinct_revision_id, ballot_number, candidate_order)
);

create index if not exists official_precinct_revisions_current_idx
  on official_precinct_revisions (precinct_number, processing_order desc);

create or replace function official_reject_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'official results are append-only: % on % is not allowed', tg_op, tg_table_name;
end;
$$;

do $$
declare target text;
begin
  foreach target in array array['official_fetch_attempts', 'official_import_runs', 'official_precinct_revisions', 'official_list_votes', 'official_candidate_votes'] loop
    execute format('drop trigger if exists %I on %I', target || '_append_only', target);
    execute format('create trigger %I before update or delete on %I for each row execute function official_reject_mutation()', target || '_append_only', target);
    execute format('drop trigger if exists %I on %I', target || '_no_truncate', target);
    execute format('create trigger %I before truncate on %I for each statement execute function official_reject_mutation()', target || '_no_truncate', target);
  end loop;
end;
$$;

-- Newest revision of each precinct from accepted runs only. Ordering follows the ČSÚ rule
-- (highest PORADI_ZPRAC), never the local insert time, so replaying an old batch cannot
-- displace a newer result. Discrepant revisions stay visible here; consumers decide.
create or replace view official_current_precincts as
select distinct on (revision.precinct_number)
  revision.id as revision_id,
  revision.precinct_number,
  revision.processing_order,
  revision.processed_at_local,
  revision.resent,
  revision.registered_voters,
  revision.issued_envelopes,
  revision.returned_envelopes,
  revision.valid_ballots,
  revision.valid_votes,
  revision.validation_status,
  revision.validation_note,
  run.id as import_run_id,
  run.batch_number,
  run.source_url,
  run.source_sha256,
  run.fetched_at
from official_precinct_revisions revision
join official_import_runs run on run.id = revision.import_run_id
where run.import_status = 'accepted'
order by revision.precinct_number, revision.processing_order desc, run.batch_number desc, run.fetched_at desc, revision.id desc;
