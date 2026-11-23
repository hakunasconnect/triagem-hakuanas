-- Configuração da conexão com a Evolution (WhatsApp). Linha única, só o admin master lê e altera.
create table if not exists public.alert_settings(
  id boolean primary key default true check (id),
  evolution_url text not null default 'https://evo.n8ndredson.com' check (evolution_url ~ '^https://[^ ]+$'),
  instance text not null default '' check (char_length(instance)<=100),
  api_key text not null default '' check (char_length(api_key)<=300),
  notify_use boolean not null default true,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.alert_settings(id) values(true) on conflict do nothing;
alter table public.alert_settings enable row level security;
revoke all on public.alert_settings from anon, authenticated;
grant select, update on public.alert_settings to authenticated;
drop policy if exists settings_admin on public.alert_settings;
create policy settings_admin on public.alert_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
