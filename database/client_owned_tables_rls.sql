-- Enforce owner-scoped access for client-accessible tables and block direct
-- client access to server-managed billing tables.

alter table if exists public.uploads enable row level security;
alter table if exists public.folders enable row level security;
alter table if exists public.flashcards enable row level security;
alter table if exists public.mock_exams enable row level security;
alter table if exists public.user_tiers enable row level security;
alter table if exists public.billing_subscriptions enable row level security;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'uploads'
      and column_name = 'user_id'
  ) then
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'uploads' and policyname = 'uploads_select_own'
    ) then
      create policy uploads_select_own
        on public.uploads
        for select
        to authenticated
        using (auth.uid() = user_id);
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'uploads' and policyname = 'uploads_insert_own'
    ) then
      create policy uploads_insert_own
        on public.uploads
        for insert
        to authenticated
        with check (auth.uid() = user_id);
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'uploads' and policyname = 'uploads_update_own'
    ) then
      create policy uploads_update_own
        on public.uploads
        for update
        to authenticated
        using (auth.uid() = user_id)
        with check (auth.uid() = user_id);
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'uploads' and policyname = 'uploads_delete_own'
    ) then
      create policy uploads_delete_own
        on public.uploads
        for delete
        to authenticated
        using (auth.uid() = user_id);
    end if;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'folders'
      and column_name = 'user_id'
  ) then
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'folders' and policyname = 'folders_select_own'
    ) then
      create policy folders_select_own
        on public.folders
        for select
        to authenticated
        using (auth.uid() = user_id);
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'folders' and policyname = 'folders_insert_own'
    ) then
      create policy folders_insert_own
        on public.folders
        for insert
        to authenticated
        with check (auth.uid() = user_id);
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'folders' and policyname = 'folders_update_own'
    ) then
      create policy folders_update_own
        on public.folders
        for update
        to authenticated
        using (auth.uid() = user_id)
        with check (auth.uid() = user_id);
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'folders' and policyname = 'folders_delete_own'
    ) then
      create policy folders_delete_own
        on public.folders
        for delete
        to authenticated
        using (auth.uid() = user_id);
    end if;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'flashcards'
      and column_name = 'user_id'
  ) then
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'flashcards' and policyname = 'flashcards_select_own'
    ) then
      create policy flashcards_select_own
        on public.flashcards
        for select
        to authenticated
        using (auth.uid() = user_id);
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'flashcards' and policyname = 'flashcards_insert_own'
    ) then
      create policy flashcards_insert_own
        on public.flashcards
        for insert
        to authenticated
        with check (auth.uid() = user_id);
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'flashcards' and policyname = 'flashcards_update_own'
    ) then
      create policy flashcards_update_own
        on public.flashcards
        for update
        to authenticated
        using (auth.uid() = user_id)
        with check (auth.uid() = user_id);
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'flashcards' and policyname = 'flashcards_delete_own'
    ) then
      create policy flashcards_delete_own
        on public.flashcards
        for delete
        to authenticated
        using (auth.uid() = user_id);
    end if;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'mock_exams'
      and column_name = 'user_id'
  ) then
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'mock_exams' and policyname = 'mock_exams_select_own'
    ) then
      create policy mock_exams_select_own
        on public.mock_exams
        for select
        to authenticated
        using (auth.uid() = user_id);
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'mock_exams' and policyname = 'mock_exams_insert_own'
    ) then
      create policy mock_exams_insert_own
        on public.mock_exams
        for insert
        to authenticated
        with check (auth.uid() = user_id);
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'mock_exams' and policyname = 'mock_exams_update_own'
    ) then
      create policy mock_exams_update_own
        on public.mock_exams
        for update
        to authenticated
        using (auth.uid() = user_id)
        with check (auth.uid() = user_id);
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'mock_exams' and policyname = 'mock_exams_delete_own'
    ) then
      create policy mock_exams_delete_own
        on public.mock_exams
        for delete
        to authenticated
        using (auth.uid() = user_id);
    end if;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_tiers'
      and column_name = 'user_id'
  ) then
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'user_tiers' and policyname = 'user_tiers_select_own'
    ) then
      create policy user_tiers_select_own
        on public.user_tiers
        for select
        to authenticated
        using (auth.uid() = user_id);
    end if;
  end if;
end
$$;

comment on table public.billing_subscriptions is
  'Server-managed subscription table. Client access is blocked by RLS unless explicitly granted.';
