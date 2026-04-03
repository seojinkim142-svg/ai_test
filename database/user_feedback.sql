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

alter table public.user_feedback
  add column if not exists user_email text not null default '',
  add column if not exists user_name text not null default '',
  add column if not exists status text not null default 'open',
  add column if not exists last_replied_at timestamptz,
  add column if not exists last_reply_excerpt text not null default '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_feedback_status_check'
  ) then
    alter table public.user_feedback
      add constraint user_feedback_status_check check (status in ('open', 'replied'));
  end if;
end
$$;

create table if not exists public.user_feedback_replies (
  id bigserial primary key,
  feedback_id bigint not null references public.user_feedback (id) on delete cascade,
  responder_user_id uuid references auth.users (id) on delete set null,
  responder_email text not null default '',
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.user_feedback_replies
  add column if not exists source_message_id text,
  add column if not exists source_subject text not null default '',
  add column if not exists source_mailbox text not null default '',
  add column if not exists synced_at timestamptz not null default now();

create index if not exists user_feedback_user_created_idx
  on public.user_feedback (user_id, created_at desc);

create index if not exists user_feedback_doc_id_idx
  on public.user_feedback (doc_id);

create index if not exists user_feedback_status_created_idx
  on public.user_feedback (status, created_at desc);

create index if not exists user_feedback_replies_feedback_created_idx
  on public.user_feedback_replies (feedback_id, created_at desc);

create unique index if not exists user_feedback_replies_source_message_id_key
  on public.user_feedback_replies (source_message_id)
  where source_message_id is not null;

comment on table public.user_feedback is
  'User-submitted feedback captured from the Zeusian app.';

comment on column public.user_feedback.metadata_json is
  'Optional context such as page number, total pages, and tier at submission time.';

comment on table public.user_feedback_replies is
  'Admin replies sent back to a user feedback submitter.';

alter table public.user_feedback enable row level security;
alter table public.user_feedback_replies enable row level security;

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
      and tablename = 'user_feedback_replies'
      and policyname = 'user_feedback_replies_select_owner'
  ) then
    create policy user_feedback_replies_select_owner
      on public.user_feedback_replies
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.user_feedback
          where public.user_feedback.id = feedback_id
            and public.user_feedback.user_id = auth.uid()
        )
      );
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
