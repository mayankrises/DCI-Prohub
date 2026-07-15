alter table public.projects
  add column if not exists closed_codes text[] not null default array['1','R','V']::text[],
  add column if not exists resubmission_codes text[] not null default array['2','3']::text[];
