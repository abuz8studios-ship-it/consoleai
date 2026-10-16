-- ConsoleAI CP1 fix: wrap auth.uid() in (select ...) in direct RLS policy expressions
-- so Postgres evaluates it once per statement (initplan), not once per row.

alter policy profiles_select_self_or_shared on public.profiles
  using (id = (select auth.uid()) or private.shares_console_with(id));

alter policy profiles_insert_self on public.profiles
  with check (id = (select auth.uid()));

alter policy profiles_update_self on public.profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter policy profiles_delete_self on public.profiles
  using (id = (select auth.uid()));

alter policy consoles_insert_owner on public.consoles
  with check (owner_id = (select auth.uid()));

alter policy consoles_update_admin on public.consoles
  with check (owner_id = (select auth.uid()) or private.has_console_role(id, array['owner']));

alter policy consoles_delete_owner on public.consoles
  using (owner_id = (select auth.uid()) and private.has_console_role(id, array['owner']));

alter policy memberships_delete_admin on public.memberships
  using (
    private.has_console_role(console_id, array['owner','admin'])
    and not (profile_id = (select auth.uid()) and role = 'owner')
  );
