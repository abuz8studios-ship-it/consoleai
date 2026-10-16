-- CP4 + CP4.5 proof: two synthetic principals, invariants, cross-tenant triggers,
-- RLS visibility, circuit breaker, credit idempotency. All proof rows are deleted
-- at the end (and a failed assert rolls the whole DO block back).
do $$
declare
  a uuid := '11111111-1111-4111-8111-111111111111';
  b uuid := '22222222-2222-4222-8222-222222222222';
  ca uuid; cb uuid; ra uuid; rb uuid; ta uuid; ga uuid; gb uuid; ja uuid;
  apa uuid; conn uuid; auto_id uuid; n int; bal int;
  blocked1 boolean := false; blocked2 boolean := false; xlink boolean := false;
  xgrant boolean := false; dupcred boolean := false; sat_at timestamptz; st text;
begin
  delete from public.consoles where slug like 'cp45-proof-%';
  delete from auth.users where id in (a, b);

  insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    (a, 'authenticated', 'authenticated', 'cp45-a@proof.local', '', now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now()),
    (b, 'authenticated', 'authenticated', 'cp45-b@proof.local', '', now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now());
  insert into public.profiles (id, display_name, actor_kind) values (a, 'Proof A', 'human'), (b, 'Proof B', 'human');
  insert into public.consoles (name, slug, owner_id) values ('CP45 Alpha', 'cp45-proof-alpha', a) returning id into ca;
  insert into public.consoles (name, slug, owner_id) values ('CP45 Beta', 'cp45-proof-beta', b) returning id into cb;
  insert into public.rooms (console_id, created_by, name, slug) values (ca, a, 'Proof Room', 'proof-room') returning id into ra;
  insert into public.rooms (console_id, created_by, name, slug) values (cb, b, 'Beta Room', 'proof-room') returning id into rb;
  insert into public.threads (room_id, created_by, title, anchor_type) values (ra, a, 'General', 'general') returning id into ta;
  insert into public.agents (console_id, created_by, display_name, slug, kind, visibility) values (ca, a, 'Proof Agent', 'proof-agent', 'custom_webhook', 'console') returning id into ga;
  insert into public.agents (console_id, created_by, display_name, slug, kind, visibility) values (cb, b, 'Beta Agent', 'beta-agent', 'custom_webhook', 'console') returning id into gb;
  insert into public.room_members (room_id, agent_id, role) values (ra, ga, 'member');
  insert into public.job_jackets (console_id, room_id, created_by, title, state) values (ca, ra, a, 'Proof jacket', 'evidence_open') returning id into ja;

  insert into public.apps (console_id, home_room_id, created_by, created_by_agent, name, slug, kind, fields, visibility)
    values (ca, ra, a, ga, 'Proof Tracker', 'proof-tracker', 'tracker', '[{"key":"client","label":"Client","type":"text"}]'::jsonb, 'room') returning id into apa;
  insert into public.app_views (app_id, created_by, name, view_kind, is_default) values (apa, a, 'Table', 'table', true);
  insert into public.app_records (app_id, created_by, created_by_agent, title, status, values)
    values (apa, a, ga, 'First proof record', 'open', '{"client":"Proof Client"}'::jsonb);
  insert into public.app_links (app_id, room_id, created_by) values (apa, ra, a);
  insert into public.threads (room_id, created_by, title, anchor_type, anchor_id) values (ra, a, 'App thread', 'app', apa);
  insert into public.messages (thread_id, author_profile_id, author_agent_id, kind, body) values (ta, a, ga, 'app_card', 'App card: Proof Tracker');

  insert into public.stips (jacket_id, created_by, label, required, satisfied) values (ja, a, 'Proof evidence attached', true, false);
  insert into public.verify_checks (jacket_id, created_by, kind, label, required, status) values (ja, a, 'evidence', 'Evidence reviewed', true, 'pending');

  begin
    update public.job_jackets set state = 'funded' where id = ja;
  exception when others then
    if sqlerrm like '%funded blocked%' then blocked1 := true; else raise; end if;
  end;
  if not blocked1 then raise exception 'PROOF FAIL: funded allowed before required check passed'; end if;

  update public.verify_checks set status = 'pass', checked_by = a where jacket_id = ja;
  begin
    update public.job_jackets set state = 'funded' where id = ja;
  exception when others then
    if sqlerrm like '%stip%' then blocked2 := true; else raise; end if;
  end;
  if not blocked2 then raise exception 'PROOF FAIL: funded allowed with unsatisfied required stip'; end if;

  update public.stips set satisfied = true, satisfied_by = a where jacket_id = ja returning satisfied_at into sat_at;
  if sat_at is null then raise exception 'PROOF FAIL: stip satisfied_at not set by trigger'; end if;
  update public.job_jackets set state = 'funded' where id = ja returning state into st;
  if st <> 'funded' then raise exception 'PROOF FAIL: funded did not open after all required checks/stips'; end if;

  insert into public.approvals (console_id, jacket_id, requested_by, kind, title) values (ca, ja, a, 'fund', 'Approve proof funding');
  insert into public.credit_ledger (console_id, created_by, entry_kind, credits, idempotency_key) values (ca, a, 'grant', 100, 'proof-grant-1');
  insert into public.credit_ledger (console_id, created_by, jacket_id, entry_kind, credits) values (ca, a, ja, 'dispatch_charge', -5);
  begin
    insert into public.credit_ledger (console_id, created_by, entry_kind, credits, idempotency_key) values (ca, a, 'grant', 100, 'proof-grant-1');
  exception when unique_violation then dupcred := true;
  end;
  if not dupcred then raise exception 'PROOF FAIL: duplicate idempotency credit accepted'; end if;
  select coalesce(sum(credits),0) into bal from public.credit_ledger where console_id = ca;
  if bal <> 95 then raise exception 'PROOF FAIL: credit balance % <> 95', bal; end if;

  insert into public.connections (console_id, created_by, name, kind, auth_ref, status) values (ca, a, 'Proof Webhook', 'webhook', 'vault:proof-ref', 'connected') returning id into conn;
  insert into public.connection_grants (connection_id, agent_id, created_by, access) values (conn, ga, a, 'write');
  begin
    insert into public.connection_grants (connection_id, agent_id, created_by, access) values (conn, gb, a, 'read');
  exception when others then
    if sqlerrm like '%another console%' then xgrant := true; else raise; end if;
  end;
  if not xgrant then raise exception 'PROOF FAIL: cross-console connection grant accepted'; end if;

  begin
    insert into public.app_links (app_id, room_id, created_by) values (apa, rb, a);
  exception when others then
    if sqlerrm like '%another console%' then xlink := true; else raise; end if;
  end;
  if not xlink then raise exception 'PROOF FAIL: cross-console app link accepted'; end if;

  insert into public.automations (console_id, room_id, agent_id, created_by, name, trigger_kind, status)
    values (ca, ra, ga, a, 'Proof follow-up', 'schedule', 'active') returning id into auto_id;
  update public.automations set fail_count = 3 where id = auto_id returning status into st;
  if st <> 'paused' then raise exception 'PROOF FAIL: automation 3-fail breaker did not pause (status %)', st; end if;

  insert into public.memories (console_id, room_id, created_by, kind, scope, title, body) values (ca, ra, a, 'context', 'room', 'Proof memory', 'Proofs must be real rows.');
  insert into public.files (console_id, room_id, jacket_id, created_by, name, external_url, kind) values (ca, ra, ja, a, 'proof-evidence', 'https://example.com/proof', 'evidence');

  -- RLS visibility as A
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute 'select count(*) from public.apps' into n;
  if n <> 1 then raise exception 'PROOF FAIL: A apps visible % <> 1', n; end if;
  execute 'select count(*) from public.app_records' into n;
  if n <> 1 then raise exception 'PROOF FAIL: A records visible % <> 1', n; end if;
  execute 'select count(*) from public.credit_ledger' into n;
  if n <> 2 then raise exception 'PROOF FAIL: A credits visible % <> 2', n; end if;
  execute 'select count(*) from public.approvals' into n;
  if n <> 1 then raise exception 'PROOF FAIL: A approvals visible % <> 1', n; end if;
  execute 'reset role';

  -- RLS visibility as B (must see none of A's tenant)
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute 'select count(*) from public.apps' into n;
  if n <> 0 then raise exception 'PROOF FAIL: B can see % A apps', n; end if;
  execute 'select count(*) from public.job_jackets' into n;
  if n <> 0 then raise exception 'PROOF FAIL: B can see % jackets', n; end if;
  execute 'select count(*) from public.credit_ledger' into n;
  if n <> 0 then raise exception 'PROOF FAIL: B can see % credit rows', n; end if;
  execute 'select count(*) from public.consoles' into n;
  if n <> 1 then raise exception 'PROOF FAIL: B consoles visible % <> 1', n; end if;
  execute 'reset role';

  -- Child-first cleanup (same order as the CP2+CP3 proof): a bare console
  -- cascade can try to SET NULL agent authors on messages whose thread was
  -- already cascade-deleted in the same statement.
  delete from public.messages where thread_id in (select id from public.threads where room_id in (ra, rb));
  delete from public.app_records where app_id = apa;
  delete from public.app_links where app_id = apa;
  delete from public.app_views where app_id = apa;
  delete from public.apps where id = apa;
  delete from public.stips where jacket_id = ja;
  delete from public.verify_checks where jacket_id = ja;
  delete from public.approvals where console_id in (ca, cb);
  delete from public.credit_ledger where console_id in (ca, cb);
  delete from public.files where console_id in (ca, cb);
  delete from public.memories where console_id in (ca, cb);
  delete from public.automations where console_id in (ca, cb);
  delete from public.connection_grants where connection_id = conn;
  delete from public.connections where id = conn;
  delete from public.job_jackets where id = ja;
  delete from public.room_members where room_id in (ra, rb);
  delete from public.threads where room_id in (ra, rb);
  delete from public.rooms where id in (ra, rb);
  delete from public.agents where id in (ga, gb);
  delete from public.consoles where id in (ca, cb);
  delete from public.profiles where id in (a, b);
  delete from auth.users where id in (a, b);
  select count(*) into n from public.consoles where slug like 'cp45-proof-%';
  if n <> 0 then raise exception 'PROOF FAIL: cleanup left % consoles', n; end if;
end $$;
select 'CP4_CP45_RLS_PROOF_PASS' as verdict,
  (select count(*) from public.consoles) as consoles_left,
  (select count(*) from public.apps) as apps_left,
  (select count(*) from public.credit_ledger) as credit_rows_left;
