alter table if exists public.uploads
  add column if not exists is_vocabulary boolean not null default false;

comment on column public.uploads.is_vocabulary is
  'True when the user has marked this file as a vocabulary list (단어장).';
