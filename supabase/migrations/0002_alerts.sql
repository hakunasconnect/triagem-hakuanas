-- Alertas de triagem em risco (vermelho/preto) enviados por WhatsApp via Evolution.
-- Contém dado identificável de saúde: acesso só do admin master. Gravação só pelo servidor (service role).
create table if not exists public.alert_recipients(
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  whatsapp text not null check (whatsapp ~ '^[0-9]{10,15}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (whatsapp)
);
create table if not exists public.alerts(
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  triager_id uuid references auth.users(id) on delete set null,
  color text not null check (color in ('red','black')),
  participant_name text not null default '' check (char_length(participant_name)<=200),
  participant_phone text not null default '' check (char_length(participant_phone)<=40),
  participant_email text not null default '' check (char_length(participant_email)<=200),
  reasons text[] not null default '{}',
  delivery jsonb not null default '[]'::jsonb
);
create index if not exists alerts_created on public.alerts(created_at desc);
alter table public.alert_recipients enable row level security;
alter table public.alerts enable row level security;
revoke all on public.alert_recipients, public.alerts from anon, authenticated;
grant select, insert, update, delete on public.alert_recipients to authenticated;
grant select on public.alerts to authenticated;
drop policy if exists recipients_admin on public.alert_recipients;
create policy recipients_admin on public.alert_recipients for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists alerts_admin_read on public.alerts;
create policy alerts_admin_read on public.alerts for select to authenticated using (public.is_admin());
