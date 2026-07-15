-- Internal review + Comment Resolution Sheet architecture
alter table document_files add column if not exists file_role text not null default 'clean';
alter table document_files add column if not exists source_file_id uuid references document_files(id) on delete set null;
alter table document_files add column if not exists issue_number integer;
create index if not exists idx_document_files_role on document_files(document_id, file_role);

create table if not exists review_cycles (
  id uuid primary key default gen_random_uuid(),
  project_id bigint not null,
  document_id bigint not null,
  target_revision text not null default 'Rev-0',
  clean_version_id uuid references document_versions(id) on delete set null,
  corrected_version_id uuid references document_versions(id) on delete set null,
  cycle_number integer not null default 1,
  review_scope text not null default 'internal' check (review_scope in ('internal','external')),
  status text not null default 'draft' check (status in ('draft','open_for_review','comments_issued','consultant_action','corrected_uploaded','verification','closed')),
  contractor_organisation text,
  consultant_organisation text,
  due_date date,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  closed_by uuid,
  closed_at timestamptz,
  unique(document_id, target_revision, cycle_number, review_scope)
);

create table if not exists review_comment_counters (
  document_id bigint primary key,
  next_number integer not null default 1
);

create or replace function next_review_comment_number(p_document_id bigint)
returns integer language plpgsql as $$
declare allocated integer;
begin
  insert into review_comment_counters(document_id,next_number) values(p_document_id,2)
  on conflict(document_id) do update set next_number=review_comment_counters.next_number+1
  returning next_number-1 into allocated;
  return allocated;
end; $$;

create table if not exists review_comments (
  id uuid primary key default gen_random_uuid(),
  project_id bigint not null,
  document_id bigint not null,
  review_cycle_id uuid references review_cycles(id) on delete cascade,
  version_id uuid references document_versions(id) on delete set null,
  document_file_id uuid references document_files(id) on delete set null,
  comment_number integer not null,
  comment_code text not null,
  page_number integer not null default 1,
  comment_text text not null,
  geometry jsonb not null default '{}'::jsonb,
  style jsonb not null default '{}'::jsonb,
  visibility text not null default 'internal' check (visibility in ('internal','external')),
  status text not null default 'open' check (status in ('open','responded','awaiting_verification','resolved','reopened')),
  priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
  category text,
  raised_by uuid not null,
  raised_by_org text not null default 'contractor',
  assigned_to uuid,
  assigned_org text not null default 'consultant',
  raised_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_by uuid,
  resolved_at timestamptz,
  closure_remarks text,
  unique(document_id, comment_number)
);
create index if not exists idx_review_comments_project on review_comments(project_id,status);
create index if not exists idx_review_comments_document on review_comments(document_id,version_id);

create table if not exists review_comment_responses (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references review_comments(id) on delete cascade,
  response_type text not null default 'reply' check (response_type in ('reply','resolution_request','resolution','reopen','internal_note')),
  response_text text not null,
  created_by uuid not null,
  created_by_org text,
  created_at timestamptz not null default now()
);

create table if not exists review_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id bigint not null,
  document_id bigint not null,
  review_cycle_id uuid references review_cycles(id) on delete set null,
  version_id uuid references document_versions(id) on delete cascade,
  source_file_id uuid references document_files(id) on delete restrict,
  commented_file_id uuid references document_files(id) on delete restrict,
  issue_number integer not null,
  issued_by uuid not null,
  issued_at timestamptz not null default now(),
  comment_count integer not null default 0,
  notes text,
  unique(version_id,issue_number)
);
