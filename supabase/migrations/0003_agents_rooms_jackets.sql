-- ConsoleAI CP2 + CP3: agent passports, multiplayer rooms, anchored threads,
-- job jackets, dispatch and run-step ledger. Billing remains deliberately absent.

-- ---------- Helpers ----------
create or replace function private.is_console_member(target_console uuid)
returns boolean language sql stable security definer set search_path = private, public as $$
  select exists (
    select 1 from public.memberships m
    where m.console_id = target_console and m.profile_id = auth.uid()
  );
$$;

create or replace function private.can_write_console(target_console uuid)
returns boolean language sql stable security definer set search_path = private, public as $$
  select private.has_console_role(target_console, array['owner','admin','member']);
$$;

-- ---------- Agents / passports ----------
create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  console_id uuid not null references public.consoles(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  profile_id uuid references public.profiles(id) on delete set null,
  display_name text not null check (char_length(display_name) between 1 and 80),
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  kind text not null default 'custom_webhook' check (kind in ('hermes','claude_code','codex','devin','custom_webhook','mcp','local','other')),
  brain_model text not null default '',
  specialty text not null default '',
  capabilities text[] not null default '{}',
  instructions text not null default '',
  endpoint_url text check (endpoint_url is null or endpoint_url ~ '^https?://'),
  visibility text not null default 'private' check (visibility in ('private','console')),
  status text not null default 'draft' check (status in ('draft','checking','ready','paused','error')),
  last_probe_at timestamptz,
  last_probe_ok boolean,
  last_probe_detail text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (console_id, slug)
);
create index if not exists agents_console_idx on public.agents(console_id);
create index if not exists agents_creator_idx on public.agents(created_by);

create or replace function private.can_access_agent(target_agent uuid)
returns boolean language sql stable security definer set search_path = private, public as $$
  select exists (
    select 1 from public.agents a
    where a.id = target_agent
      and a.console_id in (select private.my_console_ids())
      and (
        a.visibility = 'console'
        or a.created_by = auth.uid()
        or private.has_console_role(a.console_id, array['owner','admin'])
      )
  );
$$;

create table if not exists public.capability_probes (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  checked_by uuid not null references public.profiles(id) on delete restrict,
  method text not null default 'browser_http' check (method in ('browser_http','manual')),
  target_url text not null default '',
  ok boolean not null,
  http_status integer,
  latency_ms integer,
  detail text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists capability_probes_agent_idx on public.capability_probes(agent_id, created_at desc);

-- ---------- Rooms ----------
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  console_id uuid not null references public.consoles(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 80),
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  guidelines text not null default '' check (char_length(guidelines) <= 4096),
  default_agent_id uuid references public.agents(id) on delete set null,
  mention_only boolean not null default false,
  status text not null default 'active' check (status in ('active','paused','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (console_id, slug)
);
create index if not exists rooms_console_idx on public.rooms(console_id);

create table if not exists public.room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member','viewer')),
  created_at timestamptz not null default now(),
  constraint room_members_one_actor check ((profile_id is not null) <> (agent_id is not null))
);
create unique index if not exists room_members_profile_unique on public.room_members(room_id, profile_id) where profile_id is not null;
create unique index if not exists room_members_agent_unique on public.room_members(room_id, agent_id) where agent_id is not null;
create index if not exists room_members_profile_idx on public.room_members(profile_id);
create index if not exists room_members_agent_idx on public.room_members(agent_id);

create or replace function private.can_access_room(target_room uuid)
returns boolean language sql stable security definer set search_path = private, public as $$
  select exists (
    select 1 from public.room_members rm
    where rm.room_id = target_room and rm.profile_id = auth.uid()
  );
$$;

create or replace function private.can_write_room(target_room uuid)
returns boolean language sql stable security definer set search_path = private, public as $$
  select exists (
    select 1 from public.room_members rm
    where rm.room_id = target_room and rm.profile_id = auth.uid() and rm.role in ('owner','admin','member')
  );
$$;

create or replace function private.has_room_role(target_room uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = private, public as $$
  select exists (
    select 1 from public.room_members rm
    where rm.room_id = target_room and rm.profile_id = auth.uid() and rm.role = any(allowed_roles)
  );
$$;

create or replace function private.agent_in_room(target_room uuid, target_agent uuid)
returns boolean language sql stable security definer set search_path = private, public as $$
  select exists (
    select 1 from public.room_members rm
    where rm.room_id = target_room and rm.agent_id = target_agent
  );
$$;

-- ---------- Threads/messages ----------
create table if not exists public.threads (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  title text not null default 'General' check (char_length(title) between 1 and 120),
  anchor_type text not null default 'general' check (anchor_type in ('general','jacket','agent','message')),
  anchor_id uuid,
  sealed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists threads_room_anchor_unique on public.threads(room_id, anchor_type, anchor_id) where anchor_id is not null;
create index if not exists threads_room_idx on public.threads(room_id, created_at);

create or replace function private.can_access_thread(target_thread uuid)
returns boolean language sql stable security definer set search_path = private, public as $$
  select exists (
    select 1 from public.threads t
    where t.id = target_thread and private.can_access_room(t.room_id)
  );
$$;

create or replace function private.can_write_thread(target_thread uuid)
returns boolean language sql stable security definer set search_path = private, public as $$
  select exists (
    select 1 from public.threads t
    where t.id = target_thread and private.can_write_room(t.room_id)
  );
$$;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  author_profile_id uuid not null references public.profiles(id) on delete restrict,
  author_agent_id uuid references public.agents(id) on delete set null,
  body text not null check (char_length(body) between 1 and 12000),
  kind text not null default 'message' check (kind in ('message','agent_output','system','evidence')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists messages_thread_idx on public.messages(thread_id, created_at);

-- ---------- Job jackets/dispatch/runs ----------
create table if not exists public.job_jackets (
  id uuid primary key default gen_random_uuid(),
  console_id uuid not null references public.consoles(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  client_name text not null default '',
  title text not null check (char_length(title) between 1 and 160),
  brief text not null default '',
  acceptance_criteria text not null default '',
  budget_cap_credits integer not null default 0 check (budget_cap_credits >= 0),
  visibility text not null default 'room' check (visibility in ('room','console')),
  state text not null default 'intake' check (state in ('intake','desked','offered','approved','dispatched','evidence_open','verifying','funded','safely_halted','on_hold','handled_error','errored','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jackets_console_idx on public.job_jackets(console_id, created_at desc);
create index if not exists jackets_room_idx on public.job_jackets(room_id);

create or replace function private.can_access_jacket(target_jacket uuid)
returns boolean language sql stable security definer set search_path = private, public as $$
  select exists (
    select 1 from public.job_jackets j
    where j.id = target_jacket
      and j.console_id in (select private.my_console_ids())
      and (j.visibility = 'console' or j.room_id is null or private.can_access_room(j.room_id))
  );
$$;

create or replace function private.can_write_jacket(target_jacket uuid)
returns boolean language sql stable security definer set search_path = private, public as $$
  select exists (
    select 1 from public.job_jackets j
    where j.id = target_jacket
      and private.can_access_jacket(j.id)
      and private.can_write_console(j.console_id)
      and (j.room_id is null or private.can_write_room(j.room_id))
  );
$$;

create table if not exists public.dispatches (
  id uuid primary key default gen_random_uuid(),
  jacket_id uuid not null references public.job_jackets(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete restrict,
  parent_dispatch_id uuid references public.dispatches(id) on delete set null,
  dispatched_by uuid not null references public.profiles(id) on delete restrict,
  mode text not null default 'deterministic' check (mode in ('deterministic','ai_step','agentic')),
  instructions text not null check (char_length(instructions) between 1 and 12000),
  handoff_note text not null default '',
  estimated_credits integer not null default 1 check (estimated_credits >= 0),
  endpoint_snapshot text,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb,
  response_text text not null default '',
  error_text text not null default '',
  status text not null default 'queued' check (status in ('queued','running','completed','errored','safely_halted','on_hold','handled_error','scheduled','cancelled')),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dispatches_jacket_idx on public.dispatches(jacket_id, created_at desc);
create index if not exists dispatches_agent_idx on public.dispatches(agent_id);

create table if not exists public.run_steps (
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null references public.dispatches(id) on delete cascade,
  sequence integer not null check (sequence >= 1),
  kind text not null default 'dispatch',
  status text not null default 'completed' check (status in ('queued','running','completed','errored','safely_halted','on_hold','handled_error','scheduled','cancelled')),
  summary text not null default '',
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  evidence_url text,
  cost_units numeric not null default 0 check (cost_units >= 0),
  created_at timestamptz not null default now(),
  unique(dispatch_id, sequence)
);
create index if not exists run_steps_dispatch_idx on public.run_steps(dispatch_id, sequence);

create or replace function private.can_access_dispatch(target_dispatch uuid)
returns boolean language sql stable security definer set search_path = private, public as $$
  select exists (
    select 1 from public.dispatches d
    where d.id = target_dispatch and private.can_access_jacket(d.jacket_id)
  );
$$;

create or replace function private.can_write_dispatch(target_dispatch uuid)
returns boolean language sql stable security definer set search_path = private, public as $$
  select exists (
    select 1 from public.dispatches d
    where d.id = target_dispatch and private.can_write_jacket(d.jacket_id)
  );
$$;

-- ---------- Integrity triggers ----------
create or replace function private.validate_room_member()
returns trigger language plpgsql security definer set search_path = private, public as $$
declare room_console uuid;
begin
  select console_id into room_console from public.rooms where id = new.room_id;
  if room_console is null then raise exception 'room not found'; end if;
  if new.profile_id is not null and not exists (
    select 1 from public.memberships m where m.console_id = room_console and m.profile_id = new.profile_id
  ) then raise exception 'room profile must first be a console member'; end if;
  if new.agent_id is not null and not exists (
    select 1 from public.agents a where a.id = new.agent_id and a.console_id = room_console
  ) then raise exception 'agent belongs to another console'; end if;
  return new;
end; $$;

create or replace function private.add_room_owner_membership()
returns trigger language plpgsql security definer set search_path = private, public as $$
begin
  insert into public.room_members(room_id, profile_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict do nothing;
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
  if new.anchor_type = 'message' and new.anchor_id is not null and not exists (
    select 1 from public.messages m join public.threads t on t.id = m.thread_id
    where m.id = new.anchor_id and t.room_id = new.room_id
  ) then raise exception 'message anchor belongs to another room'; end if;
  return new;
end; $$;

create or replace function private.validate_jacket()
returns trigger language plpgsql security definer set search_path = private, public as $$
begin
  if new.room_id is not null and not exists (
    select 1 from public.rooms r where r.id = new.room_id and r.console_id = new.console_id
  ) then raise exception 'jacket room belongs to another console'; end if;
  return new;
end; $$;

create or replace function private.validate_dispatch()
returns trigger language plpgsql security definer set search_path = private, public as $$
declare jacket_console uuid;
begin
  select console_id into jacket_console from public.job_jackets where id = new.jacket_id;
  if not exists (select 1 from public.agents a where a.id = new.agent_id and a.console_id = jacket_console)
  then raise exception 'dispatch agent belongs to another console'; end if;
  if new.parent_dispatch_id is not null and not exists (
    select 1 from public.dispatches d where d.id = new.parent_dispatch_id and d.jacket_id = new.jacket_id
  ) then raise exception 'parent dispatch belongs to another jacket'; end if;
  return new;
end; $$;

create or replace function private.validate_message()
returns trigger language plpgsql security definer set search_path = private, public as $$
declare target_room uuid;
begin
  select room_id into target_room from public.threads where id = new.thread_id;
  if target_room is null then raise exception 'thread not found'; end if;
  if new.author_agent_id is not null and not private.agent_in_room(target_room, new.author_agent_id)
  then raise exception 'agent is not a member of this room'; end if;
  return new;
end; $$;

create or replace function private.prevent_unverified_funding()
returns trigger language plpgsql security definer set search_path = private, public as $$
begin
  if new.state = 'funded' and (old.state is distinct from 'funded') then
    raise exception 'CP4 verification desk is not installed; funded state is reserved for verified jackets';
  end if;
  return new;
end; $$;

drop trigger if exists room_members_validate on public.room_members;
create trigger room_members_validate before insert or update on public.room_members for each row execute function private.validate_room_member();
drop trigger if exists rooms_add_owner on public.rooms;
create trigger rooms_add_owner after insert on public.rooms for each row execute function private.add_room_owner_membership();
drop trigger if exists threads_validate on public.threads;
create trigger threads_validate before insert or update on public.threads for each row execute function private.validate_thread();
drop trigger if exists jackets_validate on public.job_jackets;
create trigger jackets_validate before insert or update on public.job_jackets for each row execute function private.validate_jacket();
drop trigger if exists dispatches_validate on public.dispatches;
create trigger dispatches_validate before insert or update on public.dispatches for each row execute function private.validate_dispatch();
drop trigger if exists messages_validate on public.messages;
create trigger messages_validate before insert or update on public.messages for each row execute function private.validate_message();
drop trigger if exists jackets_prevent_unverified_funding on public.job_jackets;
create trigger jackets_prevent_unverified_funding before insert or update on public.job_jackets for each row execute function private.prevent_unverified_funding();

-- updated_at triggers
drop trigger if exists agents_set_updated_at on public.agents;
create trigger agents_set_updated_at before update on public.agents for each row execute function public.set_updated_at();
drop trigger if exists rooms_set_updated_at on public.rooms;
create trigger rooms_set_updated_at before update on public.rooms for each row execute function public.set_updated_at();
drop trigger if exists threads_set_updated_at on public.threads;
create trigger threads_set_updated_at before update on public.threads for each row execute function public.set_updated_at();
drop trigger if exists messages_set_updated_at on public.messages;
create trigger messages_set_updated_at before update on public.messages for each row execute function public.set_updated_at();
drop trigger if exists jackets_set_updated_at on public.job_jackets;
create trigger jackets_set_updated_at before update on public.job_jackets for each row execute function public.set_updated_at();
drop trigger if exists dispatches_set_updated_at on public.dispatches;
create trigger dispatches_set_updated_at before update on public.dispatches for each row execute function public.set_updated_at();

-- ---------- RLS ----------
alter table public.agents enable row level security;
alter table public.capability_probes enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.threads enable row level security;
alter table public.messages enable row level security;
alter table public.job_jackets enable row level security;
alter table public.dispatches enable row level security;
alter table public.run_steps enable row level security;

revoke all on table public.agents, public.capability_probes, public.rooms, public.room_members, public.threads, public.messages, public.job_jackets, public.dispatches, public.run_steps from public, anon, authenticated;
grant select, insert, update, delete on table public.agents, public.capability_probes, public.rooms, public.room_members, public.threads, public.messages, public.job_jackets, public.dispatches, public.run_steps to authenticated;

revoke all on function private.is_console_member(uuid) from public, anon;
revoke all on function private.can_write_console(uuid) from public, anon;
revoke all on function private.can_access_agent(uuid) from public, anon;
revoke all on function private.can_access_room(uuid) from public, anon;
revoke all on function private.can_write_room(uuid) from public, anon;
revoke all on function private.has_room_role(uuid, text[]) from public, anon;
revoke all on function private.agent_in_room(uuid, uuid) from public, anon;
revoke all on function private.can_access_thread(uuid) from public, anon;
revoke all on function private.can_write_thread(uuid) from public, anon;
revoke all on function private.can_access_jacket(uuid) from public, anon;
revoke all on function private.can_write_jacket(uuid) from public, anon;
revoke all on function private.can_access_dispatch(uuid) from public, anon;
revoke all on function private.can_write_dispatch(uuid) from public, anon;
grant execute on function private.is_console_member(uuid), private.can_write_console(uuid), private.can_access_agent(uuid), private.can_access_room(uuid), private.can_write_room(uuid), private.has_room_role(uuid, text[]), private.agent_in_room(uuid, uuid), private.can_access_thread(uuid), private.can_write_thread(uuid), private.can_access_jacket(uuid), private.can_write_jacket(uuid), private.can_access_dispatch(uuid), private.can_write_dispatch(uuid) to authenticated;

-- Agents
drop policy if exists agents_select_accessible on public.agents;
create policy agents_select_accessible on public.agents for select to authenticated using (private.can_access_agent(id));
drop policy if exists agents_insert_creator on public.agents;
create policy agents_insert_creator on public.agents for insert to authenticated with check (created_by = (select auth.uid()) and private.can_write_console(console_id));
drop policy if exists agents_update_owner_admin on public.agents;
create policy agents_update_owner_admin on public.agents for update to authenticated using (created_by = (select auth.uid()) or private.has_console_role(console_id, array['owner','admin'])) with check (private.can_write_console(console_id));
drop policy if exists agents_delete_owner_admin on public.agents;
create policy agents_delete_owner_admin on public.agents for delete to authenticated using (created_by = (select auth.uid()) or private.has_console_role(console_id, array['owner','admin']));

drop policy if exists probes_select_agent on public.capability_probes;
create policy probes_select_agent on public.capability_probes for select to authenticated using (private.can_access_agent(agent_id));
drop policy if exists probes_insert_agent on public.capability_probes;
create policy probes_insert_agent on public.capability_probes for insert to authenticated with check (checked_by = (select auth.uid()) and private.can_access_agent(agent_id));

-- Rooms + members
drop policy if exists rooms_select_member on public.rooms;
create policy rooms_select_member on public.rooms for select to authenticated using (private.can_access_room(id));
drop policy if exists rooms_insert_creator on public.rooms;
create policy rooms_insert_creator on public.rooms for insert to authenticated with check (created_by = (select auth.uid()) and private.can_write_console(console_id) and (default_agent_id is null or private.can_access_agent(default_agent_id)));
drop policy if exists rooms_update_admin on public.rooms;
create policy rooms_update_admin on public.rooms for update to authenticated using (private.has_room_role(id, array['owner','admin']) or private.has_console_role(console_id, array['owner','admin'])) with check (private.can_write_console(console_id));
drop policy if exists rooms_delete_admin on public.rooms;
create policy rooms_delete_admin on public.rooms for delete to authenticated using (private.has_room_role(id, array['owner']) or private.has_console_role(console_id, array['owner']));

drop policy if exists room_members_select_member on public.room_members;
create policy room_members_select_member on public.room_members for select to authenticated using (private.can_access_room(room_id));
drop policy if exists room_members_insert_admin on public.room_members;
create policy room_members_insert_admin on public.room_members for insert to authenticated with check (private.has_room_role(room_id, array['owner','admin']) or exists (select 1 from public.rooms r where r.id = room_id and private.has_console_role(r.console_id, array['owner','admin'])));
drop policy if exists room_members_update_admin on public.room_members;
create policy room_members_update_admin on public.room_members for update to authenticated using (private.has_room_role(room_id, array['owner','admin'])) with check (private.has_room_role(room_id, array['owner','admin']));
drop policy if exists room_members_delete_admin on public.room_members;
create policy room_members_delete_admin on public.room_members for delete to authenticated using (private.has_room_role(room_id, array['owner','admin']) and not (profile_id = (select auth.uid()) and role = 'owner'));

-- Threads/messages
drop policy if exists threads_select_room on public.threads;
create policy threads_select_room on public.threads for select to authenticated using (private.can_access_room(room_id));
drop policy if exists threads_insert_room on public.threads;
create policy threads_insert_room on public.threads for insert to authenticated with check (created_by = (select auth.uid()) and private.can_write_room(room_id));
drop policy if exists threads_update_room on public.threads;
create policy threads_update_room on public.threads for update to authenticated using (created_by = (select auth.uid()) or private.has_room_role(room_id, array['owner','admin'])) with check (private.can_write_room(room_id));
drop policy if exists threads_delete_room on public.threads;
create policy threads_delete_room on public.threads for delete to authenticated using (created_by = (select auth.uid()) or private.has_room_role(room_id, array['owner','admin']));

drop policy if exists messages_select_thread on public.messages;
create policy messages_select_thread on public.messages for select to authenticated using (private.can_access_thread(thread_id));
drop policy if exists messages_insert_thread on public.messages;
create policy messages_insert_thread on public.messages for insert to authenticated with check (author_profile_id = (select auth.uid()) and private.can_write_thread(thread_id));
drop policy if exists messages_update_own on public.messages;
create policy messages_update_own on public.messages for update to authenticated using (author_profile_id = (select auth.uid())) with check (author_profile_id = (select auth.uid()) and private.can_write_thread(thread_id));
drop policy if exists messages_delete_own on public.messages;
create policy messages_delete_own on public.messages for delete to authenticated using (author_profile_id = (select auth.uid()));

-- Jackets/dispatch/steps
drop policy if exists jackets_select_accessible on public.job_jackets;
create policy jackets_select_accessible on public.job_jackets for select to authenticated using (private.can_access_jacket(id));
drop policy if exists jackets_insert_writer on public.job_jackets;
create policy jackets_insert_writer on public.job_jackets for insert to authenticated with check (created_by = (select auth.uid()) and private.can_write_console(console_id) and (room_id is null or private.can_write_room(room_id)));
drop policy if exists jackets_update_writer on public.job_jackets;
create policy jackets_update_writer on public.job_jackets for update to authenticated using (private.can_write_jacket(id)) with check (private.can_write_console(console_id));
drop policy if exists jackets_delete_writer on public.job_jackets;
create policy jackets_delete_writer on public.job_jackets for delete to authenticated using (created_by = (select auth.uid()) or private.has_console_role(console_id, array['owner','admin']));

drop policy if exists dispatches_select_jacket on public.dispatches;
create policy dispatches_select_jacket on public.dispatches for select to authenticated using (private.can_access_jacket(jacket_id));
drop policy if exists dispatches_insert_jacket on public.dispatches;
create policy dispatches_insert_jacket on public.dispatches for insert to authenticated with check (dispatched_by = (select auth.uid()) and private.can_write_jacket(jacket_id) and private.can_access_agent(agent_id));
drop policy if exists dispatches_update_jacket on public.dispatches;
create policy dispatches_update_jacket on public.dispatches for update to authenticated using (private.can_write_jacket(jacket_id)) with check (private.can_write_jacket(jacket_id) and private.can_access_agent(agent_id));
drop policy if exists dispatches_delete_jacket on public.dispatches;
create policy dispatches_delete_jacket on public.dispatches for delete to authenticated using (private.can_write_jacket(jacket_id));

drop policy if exists steps_select_dispatch on public.run_steps;
create policy steps_select_dispatch on public.run_steps for select to authenticated using (private.can_access_dispatch(dispatch_id));
drop policy if exists steps_insert_dispatch on public.run_steps;
create policy steps_insert_dispatch on public.run_steps for insert to authenticated with check (private.can_write_dispatch(dispatch_id));
drop policy if exists steps_update_dispatch on public.run_steps;
create policy steps_update_dispatch on public.run_steps for update to authenticated using (private.can_write_dispatch(dispatch_id)) with check (private.can_write_dispatch(dispatch_id));
drop policy if exists steps_delete_dispatch on public.run_steps;
create policy steps_delete_dispatch on public.run_steps for delete to authenticated using (private.can_write_dispatch(dispatch_id));

-- Realtime (RLS still decides which rows each subscriber may receive)
alter publication supabase_realtime add table public.messages, public.dispatches, public.run_steps, public.job_jackets;
