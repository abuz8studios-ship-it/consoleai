-- ConsoleAI CP4 + CP5-CP7 foundations (ABUZ8-original):
-- Verify & Fund (stips, verify_checks, approvals), pooled credit ledger,
-- connections+grants, automations, memories, file metadata.
-- Replaces the CP4-reserve funding block with the real all-required-checks invariant.
-- No Stripe charge code and no scheduler engine live in this migration; say so.

create table if not exists public.stips (
  id uuid primary key default gen_random_uuid(),
  jacket_id uuid not null references public.job_jackets(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  label text not null check (char_length(label) between 1 and 200),
  detail text not null default '',
  required boolean not null default true,
  satisfied boolean not null default false,
  satisfied_by uuid references public.profiles(id) on delete set null,
  satisfied_at timestamptz,
  evidence_url text check (evidence_url is null or evidence_url ~ '^https?://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists stips_jacket_idx on public.stips(jacket_id, required, satisfied);
create index if not exists stips_creator_idx on public.stips(created_by);

create table if not exists public.verify_checks (
  id uuid primary key default gen_random_uuid(),
  jacket_id uuid not null references public.job_jackets(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  checked_by uuid references public.profiles(id) on delete set null,
  kind text not null default 'evidence' check (kind in ('evidence','acceptance','output','budget','identity','custom')),
  label text not null check (char_length(label) between 1 and 200),
  required boolean not null default true,
  status text not null default 'pending' check (status in ('pending','pass','fail','waived')),
  detail text not null default '',
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists verify_checks_jacket_idx on public.verify_checks(jacket_id, required, status);
create index if not exists verify_checks_creator_idx on public.verify_checks(created_by);

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  console_id uuid not null references public.consoles(id) on delete cascade,
  jacket_id uuid references public.job_jackets(id) on delete set null,
  dispatch_id uuid references public.dispatches(id) on delete set null,
  app_id uuid references public.apps(id) on delete set null,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  decided_by uuid references public.profiles(id) on delete set null,
  kind text not null default 'custom' check (kind in ('dispatch','publish','external_send','fund','automation','custom')),
  title text not null check (char_length(title) between 1 and 200),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending' check (status in ('pending','approved','rejected','expired','cancelled')),
  decision_note text not null default '',
  expires_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists approvals_console_idx on public.approvals(console_id, status, created_at desc);
create index if not exists approvals_jacket_idx on public.approvals(jacket_id);

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  console_id uuid not null references public.consoles(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  jacket_id uuid references public.job_jackets(id) on delete set null,
  dispatch_id uuid references public.dispatches(id) on delete set null,
  entry_kind text not null check (entry_kind in ('grant','purchase_test','dispatch_estimate','dispatch_charge','refund_failed_verification','adjustment')),
  credits integer not null check (credits <> 0),
  note text not null default '',
  idempotency_key text check (idempotency_key is null or char_length(idempotency_key) between 1 and 120),
  created_at timestamptz not null default now()
);
create unique index if not exists credit_ledger_idempotency_unique on public.credit_ledger(console_id, idempotency_key) where idempotency_key is not null;
create index if not exists credit_ledger_console_idx on public.credit_ledger(console_id, created_at desc);
create index if not exists credit_ledger_dispatch_idx on public.credit_ledger(dispatch_id);

create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  console_id uuid not null references public.consoles(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 120),
  kind text not null default 'rest' check (kind in ('gmail','outlook','slack','teams','notion','hubspot','linear','github','google_sheets','stripe_ref','salesforce','airtable','jira','calendly','confluence','twilio_ref','discord','zoom','webhook','rest','mcp','cli','custom')),
  auth_ref text not null default '',
  status text not null default 'not_connected' check (status in ('not_connected','connected','paused','error')),
  scopes text[] not null default '{}',
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (console_id, name)
);
create index if not exists connections_console_idx on public.connections(console_id, created_at desc);

create table if not exists public.connection_grants (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connections(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  access text not null default 'read' check (access in ('read','write','admin')),
  created_at timestamptz not null default now(),
  constraint connection_grants_one_target check (agent_id is not null or room_id is not null)
);
create unique index if not exists connection_grants_agent_unique on public.connection_grants(connection_id, agent_id) where agent_id is not null;
create unique index if not exists connection_grants_room_unique on public.connection_grants(connection_id, room_id) where room_id is not null;
create index if not exists connection_grants_agent_idx on public.connection_grants(agent_id);
create index if not exists connection_grants_room_idx on public.connection_grants(room_id);

create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  console_id uuid not null references public.consoles(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete set null,
  app_id uuid references public.apps(id) on delete set null,
  jacket_id uuid references public.job_jackets(id) on delete set null,
  agent_id uuid references public.agents(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 160),
  trigger_kind text not null default 'manual' check (trigger_kind in ('schedule','webhook','record_change','manual')),
  schedule_cron text not null default '',
  webhook_ref text not null default '',
  instructions text not null default '',
  status text not null default 'draft' check (status in ('draft','active','paused','errored','archived')),
  budget_credits integer not null default 0 check (budget_credits >= 0),
  fail_count integer not null default 0 check (fail_count >= 0),
  last_run_at timestamptz,
  next_run_at timestamptz,
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists automations_console_idx on public.automations(console_id, status, created_at desc);
create index if not exists automations_room_idx on public.automations(room_id);
create index if not exists automations_agent_idx on public.automations(agent_id);

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  console_id uuid not null references public.consoles(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete set null,
  agent_id uuid references public.agents(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  kind text not null default 'context' check (kind in ('preference','feedback','reference','context','instruction')),
  scope text not null default 'console' check (scope in ('console','room','agent')),
  title text not null check (char_length(title) between 1 and 160),
  body text not null default '',
  review_on date,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists memories_console_idx on public.memories(console_id, scope, created_at desc);
create index if not exists memories_room_idx on public.memories(room_id);
create index if not exists memories_agent_idx on public.memories(agent_id);

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  console_id uuid not null references public.consoles(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete set null,
  jacket_id uuid references public.job_jackets(id) on delete set null,
  app_id uuid references public.apps(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 200),
  external_url text check (external_url is null or external_url ~ '^https?://'),
  storage_path text not null default '',
  mime_type text not null default '',
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  kind text not null default 'attachment' check (kind in ('evidence','output','attachment','other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists files_console_idx on public.files(console_id, created_at desc);
create index if not exists files_room_idx on public.files(room_id);
create index if not exists files_jacket_idx on public.files(jacket_id);

create or replace function private.can_access_connection(target_connection uuid)
returns boolean language sql stable security definer set search_path = private, public as $$
  select exists (select 1 from public.connections c where c.id = target_connection and c.console_id in (select private.my_console_ids()));
$$;
create or replace function private.can_write_connection(target_connection uuid)
returns boolean language sql stable security definer set search_path = private, public as $$
  select exists (select 1 from public.connections c where c.id = target_connection
    and (c.created_by = auth.uid() or private.has_console_role(c.console_id, array['owner','admin'])));
$$;
create or replace function private.can_access_memory(target_memory uuid)
returns boolean language sql stable security definer set search_path = private, public as $$
  select exists (select 1 from public.memories m where m.id = target_memory
    and m.console_id in (select private.my_console_ids())
    and (m.scope = 'console' or m.created_by = auth.uid()
      or private.has_console_role(m.console_id, array['owner','admin'])
      or (m.room_id is not null and private.can_access_room(m.room_id))
      or (m.agent_id is not null and private.can_access_agent(m.agent_id))));
$$;

create or replace function private.touch_stip()
returns trigger language plpgsql security definer set search_path = private, public as $$
begin
  if new.satisfied and new.satisfied_at is null then new.satisfied_at = now(); end if;
  if not new.satisfied then new.satisfied_at = null; end if;
  return new;
end; $$;
create or replace function private.touch_verify_check()
returns trigger language plpgsql security definer set search_path = private, public as $$
begin
  if new.status in ('pass','fail','waived') and new.checked_at is null then new.checked_at = now(); end if;
  if new.status = 'pending' then new.checked_at = null; end if;
  return new;
end; $$;
create or replace function private.automation_circuit_breaker()
returns trigger language plpgsql security definer set search_path = private, public as $$
begin
  if new.fail_count >= 3 and new.status = 'active' then new.status = 'paused'; end if;
  if new.room_id is not null and not exists (select 1 from public.rooms r where r.id = new.room_id and r.console_id = new.console_id)
    then raise exception 'automation room belongs to another console'; end if;
  if new.agent_id is not null and not exists (select 1 from public.agents a where a.id = new.agent_id and a.console_id = new.console_id)
    then raise exception 'automation agent belongs to another console'; end if;
  if new.app_id is not null and not exists (select 1 from public.apps a where a.id = new.app_id and a.console_id = new.console_id)
    then raise exception 'automation app belongs to another console'; end if;
  if new.jacket_id is not null and not exists (select 1 from public.job_jackets j where j.id = new.jacket_id and j.console_id = new.console_id)
    then raise exception 'automation jacket belongs to another console'; end if;
  return new;
end; $$;
create or replace function private.validate_connection_grant()
returns trigger language plpgsql security definer set search_path = private, public as $$
declare conn_console uuid;
begin
  select console_id into conn_console from public.connections where id = new.connection_id;
  if conn_console is null then raise exception 'connection not found'; end if;
  if new.agent_id is not null and not exists (select 1 from public.agents a where a.id = new.agent_id and a.console_id = conn_console)
    then raise exception 'granted agent belongs to another console'; end if;
  if new.room_id is not null and not exists (select 1 from public.rooms r where r.id = new.room_id and r.console_id = conn_console)
    then raise exception 'granted room belongs to another console'; end if;
  return new;
end; $$;

create or replace function private.prevent_unverified_funding()
returns trigger language plpgsql security definer set search_path = private, public as $$
begin
  if new.state = 'funded' and (old.state is distinct from 'funded') then
    if not exists (select 1 from public.verify_checks vc where vc.jacket_id = new.id and vc.required) then
      raise exception 'funded requires at least one required verification check (CP4)';
    end if;
    if exists (select 1 from public.verify_checks vc where vc.jacket_id = new.id and vc.required and vc.status <> 'pass') then
      raise exception 'funded blocked: every required verification check must pass (CP4)';
    end if;
    if exists (select 1 from public.stips s where s.jacket_id = new.id and s.required and not s.satisfied) then
      raise exception 'funded blocked: every required stip must be satisfied (CP4)';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists stips_touch on public.stips;
create trigger stips_touch before insert or update on public.stips for each row execute function private.touch_stip();
drop trigger if exists verify_checks_touch on public.verify_checks;
create trigger verify_checks_touch before insert or update on public.verify_checks for each row execute function private.touch_verify_check();
drop trigger if exists automations_breaker on public.automations;
create trigger automations_breaker before insert or update on public.automations for each row execute function private.automation_circuit_breaker();
drop trigger if exists connection_grants_validate on public.connection_grants;
create trigger connection_grants_validate before insert or update on public.connection_grants for each row execute function private.validate_connection_grant();
drop trigger if exists stips_set_updated_at on public.stips;
create trigger stips_set_updated_at before update on public.stips for each row execute function public.set_updated_at();
drop trigger if exists verify_checks_set_updated_at on public.verify_checks;
create trigger verify_checks_set_updated_at before update on public.verify_checks for each row execute function public.set_updated_at();
drop trigger if exists approvals_set_updated_at on public.approvals;
create trigger approvals_set_updated_at before update on public.approvals for each row execute function public.set_updated_at();
drop trigger if exists connections_set_updated_at on public.connections;
create trigger connections_set_updated_at before update on public.connections for each row execute function public.set_updated_at();
drop trigger if exists automations_set_updated_at on public.automations;
create trigger automations_set_updated_at before update on public.automations for each row execute function public.set_updated_at();
drop trigger if exists memories_set_updated_at on public.memories;
create trigger memories_set_updated_at before update on public.memories for each row execute function public.set_updated_at();
drop trigger if exists files_set_updated_at on public.files;
create trigger files_set_updated_at before update on public.files for each row execute function public.set_updated_at();

alter table public.stips enable row level security;
alter table public.verify_checks enable row level security;
alter table public.approvals enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.connections enable row level security;
alter table public.connection_grants enable row level security;
alter table public.automations enable row level security;
alter table public.memories enable row level security;
alter table public.files enable row level security;

revoke all on table public.stips, public.verify_checks, public.approvals, public.credit_ledger, public.connections, public.connection_grants, public.automations, public.memories, public.files from public, anon, authenticated;
grant select, insert, update, delete on table public.stips, public.verify_checks, public.approvals, public.connections, public.connection_grants, public.automations, public.memories, public.files to authenticated;
grant select, insert on table public.credit_ledger to authenticated;
revoke all on function private.can_access_connection(uuid) from public, anon;
revoke all on function private.can_write_connection(uuid) from public, anon;
revoke all on function private.can_access_memory(uuid) from public, anon;
grant execute on function private.can_access_connection(uuid), private.can_write_connection(uuid), private.can_access_memory(uuid) to authenticated;

drop policy if exists stips_select_jacket on public.stips;
create policy stips_select_jacket on public.stips for select to authenticated using (private.can_access_jacket(jacket_id));
drop policy if exists stips_insert_jacket on public.stips;
create policy stips_insert_jacket on public.stips for insert to authenticated with check (created_by = (select auth.uid()) and private.can_write_jacket(jacket_id));
drop policy if exists stips_update_jacket on public.stips;
create policy stips_update_jacket on public.stips for update to authenticated using (private.can_write_jacket(jacket_id)) with check (private.can_write_jacket(jacket_id));
drop policy if exists stips_delete_jacket on public.stips;
create policy stips_delete_jacket on public.stips for delete to authenticated using (private.can_write_jacket(jacket_id));

drop policy if exists checks_select_jacket on public.verify_checks;
create policy checks_select_jacket on public.verify_checks for select to authenticated using (private.can_access_jacket(jacket_id));
drop policy if exists checks_insert_jacket on public.verify_checks;
create policy checks_insert_jacket on public.verify_checks for insert to authenticated with check (created_by = (select auth.uid()) and private.can_write_jacket(jacket_id));
drop policy if exists checks_update_jacket on public.verify_checks;
create policy checks_update_jacket on public.verify_checks for update to authenticated using (private.can_write_jacket(jacket_id)) with check (private.can_write_jacket(jacket_id) and (checked_by is null or checked_by = (select auth.uid())));
drop policy if exists checks_delete_jacket on public.verify_checks;
create policy checks_delete_jacket on public.verify_checks for delete to authenticated using (private.can_write_jacket(jacket_id));

drop policy if exists approvals_select_console on public.approvals;
create policy approvals_select_console on public.approvals for select to authenticated using (console_id in (select private.my_console_ids()));
drop policy if exists approvals_insert_console on public.approvals;
create policy approvals_insert_console on public.approvals for insert to authenticated with check (requested_by = (select auth.uid()) and private.can_write_console(console_id) and status = 'pending');
drop policy if exists approvals_update_console on public.approvals;
create policy approvals_update_console on public.approvals for update to authenticated
  using (console_id in (select private.my_console_ids()) and private.can_write_console(console_id))
  with check (private.can_write_console(console_id) and (decided_by is null or decided_by = (select auth.uid()) or requested_by = (select auth.uid())));
drop policy if exists approvals_delete_console on public.approvals;
create policy approvals_delete_console on public.approvals for delete to authenticated using (requested_by = (select auth.uid()) or private.has_console_role(console_id, array['owner','admin']));

drop policy if exists credits_select_console on public.credit_ledger;
create policy credits_select_console on public.credit_ledger for select to authenticated using (console_id in (select private.my_console_ids()));
drop policy if exists credits_insert_console on public.credit_ledger;
create policy credits_insert_console on public.credit_ledger for insert to authenticated with check (created_by = (select auth.uid()) and private.can_write_console(console_id));

drop policy if exists connections_select_console on public.connections;
create policy connections_select_console on public.connections for select to authenticated using (console_id in (select private.my_console_ids()));
drop policy if exists connections_insert_console on public.connections;
create policy connections_insert_console on public.connections for insert to authenticated with check (created_by = (select auth.uid()) and private.has_console_role(console_id, array['owner','admin','member']));
drop policy if exists connections_update_writer on public.connections;
create policy connections_update_writer on public.connections for update to authenticated using (private.can_write_connection(id)) with check (private.can_write_connection(id));
drop policy if exists connections_delete_writer on public.connections;
create policy connections_delete_writer on public.connections for delete to authenticated using (private.can_write_connection(id));

drop policy if exists grants_select_connection on public.connection_grants;
create policy grants_select_connection on public.connection_grants for select to authenticated using (private.can_access_connection(connection_id));
drop policy if exists grants_insert_connection on public.connection_grants;
create policy grants_insert_connection on public.connection_grants for insert to authenticated with check (created_by = (select auth.uid()) and private.can_write_connection(connection_id));
drop policy if exists grants_delete_connection on public.connection_grants;
create policy grants_delete_connection on public.connection_grants for delete to authenticated using (private.can_write_connection(connection_id));

drop policy if exists automations_select_console on public.automations;
create policy automations_select_console on public.automations for select to authenticated using (console_id in (select private.my_console_ids()) and (room_id is null or private.can_access_room(room_id) or created_by = (select auth.uid()) or private.has_console_role(console_id, array['owner','admin'])));
drop policy if exists automations_insert_console on public.automations;
create policy automations_insert_console on public.automations for insert to authenticated with check (created_by = (select auth.uid()) and private.can_write_console(console_id) and (room_id is null or private.can_write_room(room_id)));
drop policy if exists automations_update_console on public.automations;
create policy automations_update_console on public.automations for update to authenticated using (created_by = (select auth.uid()) or private.has_console_role(console_id, array['owner','admin'])) with check (private.can_write_console(console_id));
drop policy if exists automations_delete_console on public.automations;
create policy automations_delete_console on public.automations for delete to authenticated using (created_by = (select auth.uid()) or private.has_console_role(console_id, array['owner','admin']));

drop policy if exists memories_select_accessible on public.memories;
create policy memories_select_accessible on public.memories for select to authenticated using (private.can_access_memory(id));
drop policy if exists memories_insert_console on public.memories;
create policy memories_insert_console on public.memories for insert to authenticated with check (created_by = (select auth.uid()) and private.can_write_console(console_id) and (room_id is null or private.can_write_room(room_id)));
drop policy if exists memories_update_own on public.memories;
create policy memories_update_own on public.memories for update to authenticated using (created_by = (select auth.uid()) or private.has_console_role(console_id, array['owner','admin'])) with check (private.can_write_console(console_id));
drop policy if exists memories_delete_own on public.memories;
create policy memories_delete_own on public.memories for delete to authenticated using (created_by = (select auth.uid()) or private.has_console_role(console_id, array['owner','admin']));

drop policy if exists files_select_console on public.files;
create policy files_select_console on public.files for select to authenticated using (console_id in (select private.my_console_ids()));
drop policy if exists files_insert_console on public.files;
create policy files_insert_console on public.files for insert to authenticated with check (created_by = (select auth.uid()) and private.can_write_console(console_id) and (room_id is null or private.can_write_room(room_id)));
drop policy if exists files_update_console on public.files;
create policy files_update_console on public.files for update to authenticated using (created_by = (select auth.uid()) or private.has_console_role(console_id, array['owner','admin'])) with check (private.can_write_console(console_id));
drop policy if exists files_delete_console on public.files;
create policy files_delete_console on public.files for delete to authenticated using (created_by = (select auth.uid()) or private.has_console_role(console_id, array['owner','admin']));

alter publication supabase_realtime add table public.stips, public.verify_checks, public.approvals, public.credit_ledger, public.automations;
