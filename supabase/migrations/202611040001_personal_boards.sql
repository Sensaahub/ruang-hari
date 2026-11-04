begin;

create table public.personal_boards (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tasks jsonb not null default '[]'::jsonb,
  revision bigint not null default 0 check (revision >= 0),
  mutation_id uuid,
  updated_at timestamptz not null default now(),
  constraint tasks_array check (jsonb_typeof(tasks) = 'array' and jsonb_array_length(tasks) <= 10000)
);
alter table public.personal_boards enable row level security;
revoke all on public.personal_boards from anon, authenticated;
grant select on public.personal_boards to authenticated;
create policy "Read only own board" on public.personal_boards for select to authenticated
  using ((select auth.uid()) = user_id);

create function public.save_personal_board(p_expected_revision bigint, p_tasks jsonb, p_mutation_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  board public.personal_boards;
  task jsonb;
  step jsonb;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_expected_revision is null or p_expected_revision < 0 or p_mutation_id is null
    or p_tasks is null or jsonb_typeof(p_tasks) <> 'array' then
    raise exception 'Invalid board' using errcode = '22023';
  end if;
  if jsonb_array_length(p_tasks) > 10000 or octet_length(p_tasks::text) > 10485760 then
    raise exception 'Board too large' using errcode = '22023';
  end if;
  for task in select value from jsonb_array_elements(p_tasks) loop
    if jsonb_typeof(task) <> 'object'
      or jsonb_typeof(task->'id') is distinct from 'string'
      or length(task->>'id') not between 1 and 99
      or jsonb_typeof(task->'title') is distinct from 'string'
      or length(trim(task->>'title')) not between 1 and 160
      or jsonb_typeof(task->'notes') is distinct from 'string' or length(task->>'notes') > 5000
      or coalesce(task->>'category','') not in ('pribadi','kerja','kesehatan','belajar','keuangan','rumah')
      or coalesce(task->>'status','') not in ('plan','doing','done')
      or coalesce(task->>'priority','') not in ('normal','high','low')
      or jsonb_typeof(task->'due') is distinct from 'string'
      or ((task->>'due') <> '' and (task->>'due') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
      or jsonb_typeof(task->'checks') is distinct from 'array' then
      raise exception 'Invalid task' using errcode = '22023';
    end if;
    if (task->>'due') <> '' then perform (task->>'due')::date; end if;
    if jsonb_array_length(task->'checks') > 100 then raise exception 'Too many steps' using errcode='22023'; end if;
    for step in select value from jsonb_array_elements(task->'checks') loop
      if jsonb_typeof(step->'text') is distinct from 'string' or length(step->>'text') > 200
        or jsonb_typeof(step->'done') is distinct from 'boolean' then
        raise exception 'Invalid step' using errcode='22023';
      end if;
    end loop;
  end loop;
  if (select count(*) <> count(distinct value->>'id') from jsonb_array_elements(p_tasks)) then
    raise exception 'Duplicate task IDs' using errcode='22023';
  end if;
  insert into public.personal_boards(user_id) values(owner_id) on conflict(user_id) do nothing;
  select * into board from public.personal_boards where user_id=owner_id for update;
  -- Retrying the same mutation after a lost response must not create a new edit.
  if board.mutation_id = p_mutation_id then return to_jsonb(board); end if;
  if board.revision <> p_expected_revision then
    raise exception 'Board changed on another device' using errcode='40001';
  end if;
  update public.personal_boards set tasks=p_tasks,revision=revision+1,mutation_id=p_mutation_id,updated_at=now()
    where user_id=owner_id returning * into board;
  return to_jsonb(board);
end;
$$;
revoke all on function public.save_personal_board(bigint,jsonb,uuid) from public, anon;
grant execute on function public.save_personal_board(bigint,jsonb,uuid) to authenticated;

-- Realtime supplements refresh-on-focus and periodic refresh.
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='personal_boards') then
    alter publication supabase_realtime add table public.personal_boards;
  end if;
end $$;
commit;
