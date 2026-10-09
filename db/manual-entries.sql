-- Shared store for the team's manual precinct entries (briefing on /).
-- Apply only to the dedicated manual-entries database, never to the official-results database.
--
-- Every save, correction and deletion is a new row; nothing is overwritten.
-- History per precinct is a single chain: each revision names the revision it was based on,
-- and the unique constraint below lets only one revision build on any given predecessor,
-- so two people editing the same precinct cannot silently overwrite each other.

create table if not exists manual_entry_revisions (
  id bigint generated always as identity primary key,
  precinct_number integer not null check (precinct_number between 6001 and 6104),
  action text not null check (action in ('save', 'delete')),
  list_votes integer[],
  author text not null check (char_length(btrim(author)) between 1 and 60),
  -- Generated in the browser; a resent request (after a network failure) is recognised, not duplicated.
  client_id uuid not null unique,
  based_on_revision bigint references manual_entry_revisions(id),
  created_at timestamptz not null default now(),
  constraint manual_entry_revisions_votes check (
    (action = 'delete' and list_votes is null)
    or (action = 'save' and cardinality(list_votes) = 11 and array_ndims(list_votes) = 1 and 0 <= all(list_votes) and 100000 >= all(list_votes))
  ),
  constraint manual_entry_revisions_linear unique nulls not distinct (precinct_number, based_on_revision)
);

create or replace function manual_reject_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'manual entries are append-only: % on % is not allowed', tg_op, tg_table_name;
end;
$$;

drop trigger if exists manual_entry_revisions_append_only on manual_entry_revisions;
create trigger manual_entry_revisions_append_only before update or delete on manual_entry_revisions
  for each row execute function manual_reject_mutation();
drop trigger if exists manual_entry_revisions_no_truncate on manual_entry_revisions;
create trigger manual_entry_revisions_no_truncate before truncate on manual_entry_revisions
  for each statement execute function manual_reject_mutation();

-- Latest revision of every precinct that is not deleted.
create or replace view manual_current_entries as
select * from (
  select distinct on (precinct_number) id, precinct_number, action, list_votes, author, created_at
  from manual_entry_revisions
  order by precinct_number, id desc
) latest
where action = 'save';
