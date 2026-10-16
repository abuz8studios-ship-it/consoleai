-- ConsoleAI CP4.5: Room Apps — living records inside rooms (ABUZ8-original schema).
-- apps / app_records / app_links / app_views. Existing tables only widened for app anchors/cards.

alter table public.threads drop constraint if exists threads_anchor_type_check;
alter table public.threads add constraint threads_anchor_type_check
  check (anchor_type in ('general','jacket','agent','message','app'));
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('message','agent_output','system','evidence','app_card'));

create table if not exists public.apps (
  id uuid primary key default gen_random_uuid(),
  console_id uuid not null references public.consoles(id) on delete cascade,
  home_room_id uuid references public.rooms(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_by_agent uuid references public.agents(id) on delete set null,
  source_dispatch_id uuid references public.dispatches(id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  kind text not null default 'tracker' check (kind in ('tracker','board','dashboard','form_page','custom')),
  description text not null default '',
  fields jsonb not null default '[]'::jsonb check (jsonb_typeof(fields) = 'array'),
  visibility text not null default 'room' check (visibility in ('private','room','console')),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (console_id, slug)
);
create index if not exists apps_console_idx on public.apps(console_id, created_at desc);
create index if not exists apps_home_room_idx on public.apps(home_room_id);
create index if not exists apps_creator_idx on public.apps(created_by);

create table if not exists public.app_records (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_by_agent uuid references public.agents(id) on delete set null,
  source_dispatch_id uuid references public.dispatches(id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  status text not null default 'open' check (char_length(status) between 1 and 40),
  values jsonb not null default '{}'::jsonb check (jsonb_typeof(values) = 'object'),
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists app_records_app_idx on public.app_records(app_id, sort, created_at);
create index if not exists app_records_status_idx on public.app_records(app_id, status);
create index if not exists app_records_creator_idx on public.app_records(created_by);

create table if not exists public.app_links (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete cascade,
  thread_id uuid references public.threads(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  context_label text not null default '',
  created_at timestamptz not null default now(),
  constraint app_links_one_context check (room_id is not null or thread_id is not null)
);
create unique index if not exists app_links_room_unique on public.app_links(app_id, room_id) where room_id is not null;
create unique index if not exists app_links_thread_unique on public.app_links(app_id, thread_id) where thread_id is not null;
create index if not exists app_links_room_idx on public.app_links(room_id);
create index if not exists app_links_thread_idx on public.app_links(thread_id);

create table if not exists public.app_views (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 80),
  view_kind text not null default 'table' check (view_kind in ('table','board','calendar','gallery','form')),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app_id, name)
);
create index if not exists app_views_app_idx on public.app_views(app_id);

create or replace function private.can_access_app(target_app uuid)
returns boolean language sql stable security definer set search_path = private, public as $$
  select exists (
    select 1 from public.apps a
    where a.id = target_app
      and a.console_id in (select private.my_console_ids())
      and (
        a.created_by = auth.uid()
        or private.has_console_role(a.console_id, array['owner','admin'])
        or a.visibility = 'console'
        or (a.home_room_id is not null and private.can_access_room(a.home_room_id))
        or exists (select 1 from public.app_links l where l.app_id = a.id and l.room_id is not null and private.can_access_room(l.room_id))
        or exists (select 1 from public.app_links l join public.threads t on t.id = l.thread_id where l.app_id = a.id and l.thread_id is not null and private.can_access_room(t.room_id))
      )
  );
$$;

create or replace function private.can_write_app(target_app uuid)
returns boolean language sql stable security definer set search_path = private, public as $$
  select exists (
    select 1 from public.apps a
    where a.id = target_app
      and private.can_access_app(a.id)
      and private.has_console_role(a.console_id, array['owner','admin','member'])
  );
$$;

create or replace function private.validate_app()
returns trigger language plpgsql security definer set search_path = private, public as $$
begin
  if new.home_room_id is not null and not exists (
    select 1 from public.rooms r where r.id = new.home_room_id and r.console_id = new.console_id
  ) then raise exception 'app home room belongs to another console'; end if;
  if new.created_by_agent is not null and not exists (
    select 1 from public.agents a where a.id = new.created_by_agent and a.console_id = new.console_id
  ) then raise exception 'app agent belongs to another console'; end if;
  if new.status = 'published' and new.published_at is null then new.published_at = now(); end if;
  return new;
end; $$;

create or replace function private.validate_app_record()
returns trigger language plpgsql security definer set search_path = private, public as $$
declare app_console uuid;
begin
  select console_id into app_console from public.apps where id = new.app_id;
  if app_console is null then raise exception 'app not found'; end if;
  if new.created_by_agent is not null and not exists (
    select 1 from public.agents a where a.id = new.created_by_agent and a.console_id = app_console
  ) then raise exception 'record agent belongs to another console'; end if;
  return new;
end; $$;

create or replace function private.validate_app_link()
returns trigger language plpgsql security definer set search_path = private, public as $$
declare app_console uuid;
begin
  select console_id into app_console from public.apps where id = new.app_id;
  if app_console is null then raise exception 'app not found'; end if;
  if new.room_id is not null and not exists (
    select 1 from public.rooms r where r.id = new.room_id and r.console_id = app_console
  ) then raise exception 'linked room belongs to another console'; end if;
  if new.thread_id is not null and not exists (
    select 1 from public.threads t join public.rooms r on r.id = t.room_id
    where t.id = new.thread_id and r.console_id = app_console
  ) then raise exception 'linked thread belongs to another console'; end if;
  return new;
end; $$;

create or replace function private.validate_thread()
returns trigger language plpgsql security definer set search_path = private, public as $$
declare room_console uuid;
begin
  select console_id into room_console from public.rooms where id = new.room_id;
  if new.anchor_type = 'jacket' and new.anchor_id is not null and not exists (
    select 1 from public.job_jackets j where j.id = new.anchor_id and j.console_id = room_console
  ) then raise exception 'jacket anchor belongs to another console'; end if;
  if new.anchor_type = 'agent' and new.anchor_id is not null and not exists (
    select 1 from public.agents a where a.id = new.anchor_id and a.console_id = room_console
  ) then raise exception 'agent anchor belongs to another console'; end if;
  if new.anchor_type = 'app' and new.anchor_id is not null and not exists (
    select 1 from public.apps a where a.id = new.anchor_id and a.console_id = room_console
  ) then raise exception 'app anchor belongs to another console'; end if;
  if new.anchor_type = 'message' and new.anchor_id is not null and not exists (
    select 1 from public.messages m join public.threads t on t.id = m.thread_id
    where m.id = new.anchor_id and t.room_id = new.room_id
  ) then raise exception 'message anchor belongs to another room'; end if;
  return new;
end; $$;

drop trigger if exists apps_validate on public.apps;
create trigger apps_validate before insert or update on public.apps for each row execute function private.validate_app();
drop trigger if exists app_records_validate on public.app_records;
create trigger app_records_validate before insert or update on public.app_records for each row execute function private.validate_app_record();
drop trigger if exists app_links_validate on public.app_links;
create trigger app_links_validate before insert or update on public.app_links for each row execute function private.validate_app_link();
drop trigger if exists apps_set_updated_at on public.apps;
create trigger apps_set_updated_at before update on public.apps for each row execute function public.set_updated_at();
drop trigger if exists app_records_set_updated_at on public.app_records;
create trigger app_records_set_updated_at before update on public.app_records for each row execute function public.set_updated_at();
drop trigger if exists app_views_set_updated_at on public.app_views;
create trigger app_views_set_updated_at before update on public.app_views for each row execute function public.set_updated_at();

alter table public.apps enable row level security;
alter table public.app_records enable row level security;
alter table public.app_links enable row level security;
alter table public.app_views enable row level security;

revoke all on table public.apps, public.app_records, public.app_links, public.app_views from public, anon, authenticated;
grant select, insert, update, delete on table public.apps, public.app_records, public.app_links, public.app_views to authenticated;
revoke all on function private.can_access_app(uuid) from public, anon;
revoke all on function private.can_write_app(uuid) from public, anon;
grant execute on function private.can_access_app(uuid), private.can_write_app(uuid) to authenticated;

drop policy if exists apps_select_accessible on public.apps;
create policy apps_select_accessible on public.apps for select to authenticated using (private.can_access_app(id));
drop policy if exists apps_insert_creator on public.apps;
create policy apps_insert_creator on public.apps for insert to authenticated
  with check (created_by = (select auth.uid()) and private.can_write_console(console_id)
    and (home_room_id is null or private.can_write_room(home_room_id) or private.has_console_role(console_id, array['owner','admin'])));
drop policy if exists apps_update_writer on public.apps;
create policy apps_update_writer on public.apps for update to authenticated using (private.can_write_app(id)) with check (private.can_write_console(console_id));
drop policy if exists apps_delete_writer on public.apps;
create policy apps_delete_writer on public.apps for delete to authenticated using (created_by = (select auth.uid()) or private.has_console_role(console_id, array['owner','admin']));

drop policy if exists app_records_select_app on public.app_records;
create policy app_records_select_app on public.app_records for select to authenticated using (private.can_access_app(app_id));
drop policy if exists app_records_insert_app on public.app_records;
create policy app_records_insert_app on public.app_records for insert to authenticated with check (created_by = (select auth.uid()) and private.can_write_app(app_id));
drop policy if exists app_records_update_app on public.app_records;
create policy app_records_update_app on public.app_records for update to authenticated using (private.can_write_app(app_id)) with check (private.can_write_app(app_id));
drop policy if exists app_records_delete_app on public.app_records;
create policy app_records_delete_app on public.app_records for delete to authenticated using (private.can_write_app(app_id));

drop policy if exists app_links_select_app on public.app_links;
create policy app_links_select_app on public.app_links for select to authenticated using (private.can_access_app(app_id));
drop policy if exists app_links_insert_app on public.app_links;
create policy app_links_insert_app on public.app_links for insert to authenticated
  with check (created_by = (select auth.uid()) and private.can_write_app(app_id)
    and (room_id is null or private.can_write_room(room_id))
    and (thread_id is null or private.can_write_thread(thread_id)));
drop policy if exists app_links_delete_app on public.app_links;
create policy app_links_delete_app on public.app_links for delete to authenticated using (private.can_write_app(app_id));

drop policy if exists app_views_select_app on public.app_views;
create policy app_views_select_app on public.app_views for select to authenticated using (private.can_access_app(app_id));
drop policy if exists app_views_insert_app on public.app_views;
create policy app_views_insert_app on public.app_views for insert to authenticated with check (created_by = (select auth.uid()) and private.can_write_app(app_id));
drop policy if exists app_views_update_app on public.app_views;
create policy app_views_update_app on public.app_views for update to authenticated using (private.can_write_app(app_id)) with check (private.can_write_app(app_id));
drop policy if exists app_views_delete_app on public.app_views;
create policy app_views_delete_app on public.app_views for delete to authenticated using (private.can_write_app(app_id));

alter publication supabase_realtime add table public.apps, public.app_records, public.app_links;
