create table public.saved_scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  scenarios jsonb not null check (
    case when jsonb_typeof(scenarios) = 'array'
      then jsonb_array_length(scenarios) = 2 else false end
  ),
  created_at timestamptz not null default now()
);

create index saved_scenarios_owner_created_idx
  on public.saved_scenarios (user_id, created_at desc);

alter table public.saved_scenarios enable row level security;
revoke all on public.saved_scenarios from anon, authenticated;
grant select, insert, delete on public.saved_scenarios to authenticated;

create policy "Read own scenarios" on public.saved_scenarios
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "Create own scenarios" on public.saved_scenarios
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "Delete own scenarios" on public.saved_scenarios
  for delete to authenticated using ((select auth.uid()) = user_id);
