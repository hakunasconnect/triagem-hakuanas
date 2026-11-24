-- Um único admin master (ninguém cria outro) e o admin pode apagar históricos de uso, alertas e resumos.
create unique index if not exists only_one_admin_master on public.profiles ((true)) where role = 'admin_master';
grant delete on public.usage_sessions, public.usage_events, public.alerts, public.triage_summaries to authenticated;
drop policy if exists sessions_admin_delete on public.usage_sessions;
create policy sessions_admin_delete on public.usage_sessions for delete to authenticated using (public.is_admin());
drop policy if exists uevents_admin_delete on public.usage_events;
create policy uevents_admin_delete on public.usage_events for delete to authenticated using (public.is_admin());
drop policy if exists alerts_admin_delete on public.alerts;
create policy alerts_admin_delete on public.alerts for delete to authenticated using (public.is_admin());
drop policy if exists summaries_admin_delete on public.triage_summaries;
create policy summaries_admin_delete on public.triage_summaries for delete to authenticated using (public.is_admin());
