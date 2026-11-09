-- Run this whole script once in Supabase > SQL Editor > New query > Run.
-- Every student gets their OWN tables, created automatically at sign-up:
--   plans_<id>  (weekly_hours, courses json, plan_text, timestamp)
--   state_<id>  (their courses, quiz scores, custom questions)
-- RLS is on with no policies, so nobody can read tables directly;
-- the app uses the functions below, which only ever touch auth.uid()'s tables.

create or replace function public.create_user_tables(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s text := replace(uid::text, '-', '');
begin
  execute format('create table if not exists public.%I (
    id bigint generated always as identity primary key,
    created_at timestamptz not null default now(),
    weekly_hours int, courses jsonb, plan_text text)', 'plans_' || s);
  execute format('alter table public.%I enable row level security', 'plans_' || s);
  execute format('create table if not exists public.%I (
    id int primary key default 1 check (id = 1),
    updated_at timestamptz not null default now(),
    data jsonb not null default ''{}''::jsonb)', 'state_' || s);
  execute format('alter table public.%I enable row level security', 'state_' || s);
end $$;
revoke all on function public.create_user_tables(uuid) from public, anon, authenticated;

-- Auto-create on sign-up
create or replace function public.on_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.create_user_tables(new.id); return new; end $$;
drop trigger if exists create_tables_on_signup on auth.users;
create trigger create_tables_on_signup after insert on auth.users
  for each row execute function public.on_new_user();

-- Create tables for any users who already exist
do $$ declare u record; begin
  for u in select id from auth.users loop perform public.create_user_tables(u.id); end loop;
end $$;

-- App functions (only for logged-in users)
create or replace function public.save_state(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare s text := replace(auth.uid()::text, '-', '');
begin
  if auth.uid() is null then raise exception 'not logged in'; end if;
  perform public.create_user_tables(auth.uid());
  execute format('insert into public.%I (id, data, updated_at) values (1, $1, now())
    on conflict (id) do update set data = $1, updated_at = now()', 'state_' || s) using p;
end $$;

create or replace function public.get_state() returns jsonb
language plpgsql security definer set search_path = public as $$
declare s text := replace(auth.uid()::text, '-', ''); r jsonb;
begin
  if auth.uid() is null then raise exception 'not logged in'; end if;
  perform public.create_user_tables(auth.uid());
  execute format('select data from public.%I where id = 1', 'state_' || s) into r;
  return r;
end $$;

create or replace function public.save_plan(p_hours int, p_courses jsonb, p_plan text) returns void
language plpgsql security definer set search_path = public as $$
declare s text := replace(auth.uid()::text, '-', '');
begin
  if auth.uid() is null then raise exception 'not logged in'; end if;
  perform public.create_user_tables(auth.uid());
  execute format('insert into public.%I (weekly_hours, courses, plan_text) values ($1, $2, $3)', 'plans_' || s)
    using p_hours, p_courses, p_plan;
end $$;

create or replace function public.get_plans() returns jsonb
language plpgsql security definer set search_path = public as $$
declare s text := replace(auth.uid()::text, '-', ''); r jsonb;
begin
  if auth.uid() is null then raise exception 'not logged in'; end if;
  perform public.create_user_tables(auth.uid());
  execute format('select coalesce(jsonb_agg(t order by t.created_at desc), ''[]''::jsonb)
    from (select * from public.%I order by created_at desc limit 20) t', 'plans_' || s) into r;
  return r;
end $$;

revoke all on function public.save_state(jsonb), public.get_state(),
  public.save_plan(int, jsonb, text), public.get_plans() from public, anon;
grant execute on function public.save_state(jsonb), public.get_state(),
  public.save_plan(int, jsonb, text), public.get_plans() to authenticated;
