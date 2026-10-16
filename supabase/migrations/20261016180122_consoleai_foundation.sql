-- ConsoleAI CP1 foundation: identity, consoles, memberships, RLS tenancy.
-- One Supabase project; consoles are tenants. Agents will be auth identities too.

create extension if not exists pgcrypto;
create schema if not exists private;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  actor_kind text not null default 'human' check (actor_kind in ('human', 'agent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.consoles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  owner_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.memberships (
  console_id uuid not null references public.consoles(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (console_id, profile_id)
);

create index if not exists memberships_profile_idx on public.memberships(profile_id);
create index if not exists consoles_owner_idx on public.consoles(owner_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists consoles_set_updated_at on public.consoles;
create trigger consoles_set_updated_at
before update on public.consoles
for each row execute function public.set_updated_at();

create or replace function private.my_console_ids()
returns setof uuid
language sql
stable
security definer
set search_path = private, public
as $$
  select m.console_id
  from public.memberships m
  where m.profile_id = auth.uid();
$$;

create or replace function private.has_console_role(target_console uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.console_id = target_console
      and m.profile_id = auth.uid()
      and m.role = any(allowed_roles)
  );
$$;

create or replace function private.shares_console_with(target_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.console_id = mine.console_id
    where mine.profile_id = auth.uid()
      and theirs.profile_id = target_profile
  );
$$;

create or replace function private.add_console_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
begin
  insert into public.memberships(console_id, profile_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (console_id, profile_id) do update set role = 'owner';
  return new;
end;
$$;

drop trigger if exists consoles_add_owner_membership on public.consoles;
create trigger consoles_add_owner_membership
after insert on public.consoles
for each row execute function private.add_console_owner_membership();

alter table public.profiles enable row level security;
alter table public.consoles enable row level security;
alter table public.memberships enable row level security;

revoke all on table public.profiles, public.consoles, public.memberships from public, anon, authenticated;
grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.consoles to authenticated;
grant select, insert, update, delete on table public.memberships to authenticated;

revoke all on function private.my_console_ids() from public, anon;
revoke all on function private.has_console_role(uuid, text[]) from public, anon;
revoke all on function private.shares_console_with(uuid) from public, anon;
grant execute on function private.my_console_ids() to authenticated;
grant execute on function private.has_console_role(uuid, text[]) to authenticated;
grant execute on function private.shares_console_with(uuid) to authenticated;

drop policy if exists profiles_select_self_or_shared on public.profiles;
create policy profiles_select_self_or_shared on public.profiles
for select to authenticated
using (id = auth.uid() or private.shares_console_with(id));

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
for insert to authenticated
with check (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists profiles_delete_self on public.profiles;
create policy profiles_delete_self on public.profiles
for delete to authenticated
using (id = auth.uid());

drop policy if exists consoles_select_member on public.consoles;
create policy consoles_select_member on public.consoles
for select to authenticated
using (id in (select private.my_console_ids()));

drop policy if exists consoles_insert_owner on public.consoles;
create policy consoles_insert_owner on public.consoles
for insert to authenticated
with check (owner_id = auth.uid());

drop policy if exists consoles_update_admin on public.consoles;
create policy consoles_update_admin on public.consoles
for update to authenticated
using (private.has_console_role(id, array['owner','admin']))
with check (owner_id = auth.uid() or private.has_console_role(id, array['owner']));

drop policy if exists consoles_delete_owner on public.consoles;
create policy consoles_delete_owner on public.consoles
for delete to authenticated
using (owner_id = auth.uid() and private.has_console_role(id, array['owner']));

drop policy if exists memberships_select_member on public.memberships;
create policy memberships_select_member on public.memberships
for select to authenticated
using (console_id in (select private.my_console_ids()));

drop policy if exists memberships_insert_admin on public.memberships;
create policy memberships_insert_admin on public.memberships
for insert to authenticated
with check (private.has_console_role(console_id, array['owner','admin']));

drop policy if exists memberships_update_admin on public.memberships;
create policy memberships_update_admin on public.memberships
for update to authenticated
using (private.has_console_role(console_id, array['owner','admin']))
with check (private.has_console_role(console_id, array['owner','admin']));

drop policy if exists memberships_delete_admin on public.memberships;
create policy memberships_delete_admin on public.memberships
for delete to authenticated
using (
  private.has_console_role(console_id, array['owner','admin'])
  and not (profile_id = auth.uid() and role = 'owner')
);
