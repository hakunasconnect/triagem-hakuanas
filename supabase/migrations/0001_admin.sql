-- Triagem Hakunas: papéis, uso do app e auditoria. Somente métricas de uso de quem opera o app.
-- Nenhum dado de participante (nome, CPF, telefone, saúde) é armazenado aqui.
create table if not exists public.profiles(
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  legend_number text not null default '' check (legend_number ~ '^[0-9]{0,10}$'),
  role text not null default 'triador' check (role in ('admin_master','coordenador','triador')),
  must_change_password boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.events(
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  top_number text not null default '' check (top_number ~ '^[0-9]{0,8}$'),
  location text not null default '' check (char_length(location)<=160),
  base_name text not null default '' check (char_length(base_name)<=100),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.usage_sessions(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  app_version text not null default '' check (char_length(app_version)<=20),
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz
);
create or replace function public.meta_is_anonymous(m jsonb) returns boolean language sql immutable as $$
  select jsonb_typeof(m)='object'
     and not exists(select 1 from jsonb_object_keys(m) k where k not in ('color','band','age_range','screen','format','duration_ms'))
     and length(m::text)<=400
$$;
create table if not exists public.usage_events(
  id bigint generated always as identity primary key,
  session_id uuid not null references public.usage_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('login','screen_view','triage_done','import','export','settings_change','logout')),
  occurred_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb check (public.meta_is_anonymous(meta))
);
create index if not exists usage_events_user_time on public.usage_events(user_id,occurred_at desc);
create table if not exists public.audit_log(
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id),
  action text not null check (char_length(action)<=80),
  target text not null default '' check (char_length(target)<=200),
  at timestamptz not null default now()
);
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role='admin_master')
$$;
create or replace function public.is_staff() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role in ('admin_master','coordenador'))
$$;
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into public.profiles(id,email) values(new.id,new.email) on conflict do nothing; return new; end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.usage_sessions enable row level security;
alter table public.usage_events enable row level security;
alter table public.audit_log enable row level security;
revoke all on public.profiles,public.events,public.usage_sessions,public.usage_events,public.audit_log from anon,authenticated;
grant select on public.profiles,public.events,public.usage_sessions,public.usage_events,public.audit_log to authenticated;
grant update(full_name,legend_number,must_change_password) on public.profiles to authenticated;
grant insert,update,delete on public.events to authenticated;
grant insert on public.usage_sessions,public.usage_events,public.audit_log to authenticated;
grant update(last_seen_at,ended_at) on public.usage_sessions to authenticated;
grant usage on sequence public.usage_events_id_seq,public.audit_log_id_seq to authenticated;
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using(id=auth.uid() or public.is_staff());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
drop policy if exists events_read on public.events;
create policy events_read on public.events for select to authenticated using(true);
drop policy if exists events_write on public.events;
create policy events_write on public.events for all to authenticated using(public.is_staff()) with check(public.is_staff());
drop policy if exists sessions_read on public.usage_sessions;
create policy sessions_read on public.usage_sessions for select to authenticated using(user_id=auth.uid() or public.is_admin());
drop policy if exists sessions_insert on public.usage_sessions;
create policy sessions_insert on public.usage_sessions for insert to authenticated with check(user_id=auth.uid());
drop policy if exists sessions_update on public.usage_sessions;
create policy sessions_update on public.usage_sessions for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists uevents_read on public.usage_events;
create policy uevents_read on public.usage_events for select to authenticated using(user_id=auth.uid() or public.is_admin());
drop policy if exists uevents_insert on public.usage_events;
create policy uevents_insert on public.usage_events for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.usage_sessions s where s.id=session_id and s.user_id=auth.uid()));
drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select to authenticated using(public.is_admin());
drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log for insert to authenticated with check(actor_id=auth.uid());
