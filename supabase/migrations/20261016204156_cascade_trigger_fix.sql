-- Fix: FK SET NULL updates during a cascade delete must not fail just because
-- the parent row was already cascade-deleted in the same statement.
-- On a true INSERT the FK itself still rejects a missing parent.
create or replace function private.validate_app_record()
returns trigger language plpgsql security definer set search_path = private, public as $$
declare app_console uuid;
begin
  select console_id into app_console from public.apps where id = new.app_id;
  if app_console is null then return new; end if;
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
  if app_console is null then return new; end if;
  if new.room_id is not null and not exists (
    select 1 from public.rooms r where r.id = new.room_id and r.console_id = app_console
  ) then raise exception 'linked room belongs to another console'; end if;
  if new.thread_id is not null and not exists (
    select 1 from public.threads t join public.rooms r on r.id = t.room_id
    where t.id = new.thread_id and r.console_id = app_console
  ) then raise exception 'linked thread belongs to another console'; end if;
  return new;
end; $$;

create or replace function private.validate_connection_grant()
returns trigger language plpgsql security definer set search_path = private, public as $$
declare conn_console uuid;
begin
  select console_id into conn_console from public.connections where id = new.connection_id;
  if conn_console is null then return new; end if;
  if new.agent_id is not null and not exists (select 1 from public.agents a where a.id = new.agent_id and a.console_id = conn_console)
    then raise exception 'granted agent belongs to another console'; end if;
  if new.room_id is not null and not exists (select 1 from public.rooms r where r.id = new.room_id and r.console_id = conn_console)
    then raise exception 'granted room belongs to another console'; end if;
  return new;
end; $$;
