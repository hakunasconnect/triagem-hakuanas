-- Papel "admin" (abaixo do admin master) com permissões configuráveis pelo admin master.
-- Padrão: tudo liberado; o admin master liga/desliga cada permissão. O admin master continua único e intocável por admins.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin_master','admin','coordenador','triador'));
alter table public.profiles add column if not exists permissions jsonb not null default '{}'::jsonb;

create or replace function public.has_perm(p text) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id=auth.uid()
    and (role='admin_master' or (role='admin' and coalesce((permissions->>p)::boolean, true))))
$$;
create or replace function public.is_staff() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role in ('admin_master','admin','coordenador'))
$$;

drop policy if exists sessions_read on public.usage_sessions;
create policy sessions_read on public.usage_sessions for select to authenticated using (user_id=auth.uid() or public.has_perm('view_metrics'));
drop policy if exists uevents_read on public.usage_events;
create policy uevents_read on public.usage_events for select to authenticated using (user_id=auth.uid() or public.has_perm('view_metrics'));
drop policy if exists alerts_admin_read on public.alerts;
create policy alerts_admin_read on public.alerts for select to authenticated using (public.has_perm('view_alerts'));
drop policy if exists summaries_admin_read on public.triage_summaries;
create policy summaries_admin_read on public.triage_summaries for select to authenticated using (public.has_perm('view_alerts'));
drop policy if exists recipients_admin on public.alert_recipients;
create policy recipients_admin on public.alert_recipients for all to authenticated using (public.has_perm('manage_recipients')) with check (public.has_perm('manage_recipients'));
drop policy if exists settings_admin on public.alert_settings;
create policy settings_admin on public.alert_settings for all to authenticated using (public.has_perm('manage_whatsapp')) with check (public.has_perm('manage_whatsapp'));
drop policy if exists sessions_admin_delete on public.usage_sessions;
create policy sessions_admin_delete on public.usage_sessions for delete to authenticated using (public.has_perm('delete_history'));
drop policy if exists uevents_admin_delete on public.usage_events;
create policy uevents_admin_delete on public.usage_events for delete to authenticated using (public.has_perm('delete_history'));
drop policy if exists alerts_admin_delete on public.alerts;
create policy alerts_admin_delete on public.alerts for delete to authenticated using (public.has_perm('delete_history'));
drop policy if exists summaries_admin_delete on public.triage_summaries;
create policy summaries_admin_delete on public.triage_summaries for delete to authenticated using (public.has_perm('delete_history'));
-- audit_log continua somente do admin master (is_admin()).
