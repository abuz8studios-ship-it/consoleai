-- Cover foreign keys flagged by Supabase Performance Advisors after CP2/CP3 schema.
create index if not exists agents_profile_idx on public.agents(profile_id) where profile_id is not null;
create index if not exists capability_probes_checked_by_idx on public.capability_probes(checked_by);
create index if not exists dispatches_dispatched_by_idx on public.dispatches(dispatched_by);
create index if not exists dispatches_parent_idx on public.dispatches(parent_dispatch_id) where parent_dispatch_id is not null;
create index if not exists jackets_created_by_idx on public.job_jackets(created_by);
create index if not exists messages_author_profile_idx on public.messages(author_profile_id);
create index if not exists messages_author_agent_idx on public.messages(author_agent_id) where author_agent_id is not null;
create index if not exists rooms_created_by_idx on public.rooms(created_by);
create index if not exists rooms_default_agent_idx on public.rooms(default_agent_id) where default_agent_id is not null;
create index if not exists threads_created_by_idx on public.threads(created_by);
