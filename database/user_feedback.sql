-- Stores in-app user feedback submissions from authenticated users.

create table if not exists public.user_feedback (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null default 'general',
  content text not null,
  doc_id text,
  doc_name text not null default '',
  panel text not null default '',
  metadata_json jsonb,
  created_at timestamptz not null default now(),
  constraint user_feedback_category_check check (category in ('general', 'bug', 'feature', 'ux'))
);

create index if not exists user_feedback_user_created_idx
  on public.user_feedback (user_id, created_at desc);

create index if not exists user_feedback_doc_id_idx
  on public.user_feedback (doc_id);

comment on table public.user_feedback is
  'User-submitted feedback captured from the Zeusian app.';

comment on column public.user_feedback.metadata_json is
  'Optional context such as page number, total pages, and tier at submission time.';

alter table public.user_feedback enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_feedback'
      and policyname = 'user_feedback_insert_own'
  ) then
    create policy user_feedback_insert_own
      on public.user_feedback
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_feedback'
      and policyname = 'user_feedback_select_own'
  ) then
    create policy user_feedback_select_own
      on public.user_feedback
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end
$$;
