-- Tudo que é do admin master é só dele. Nenhum admin (nem com todas as permissões) altera ou apaga:
--  * a conexão do WhatsApp (alert_settings) e quem recebe os alertas (alert_recipients);
--  * alertas e resumos das triagens (o admin pode ler, com view_alerts);
--  * eventos criados pelo master e o histórico de uso do próprio master.
-- Idempotente: pode ser executada mais de uma vez.

create or replace function public.is_master_user(uid uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id=uid and role='admin_master')
$$;

-- WhatsApp e destinatários: somente o admin master.
drop policy if exists settings_admin on public.alert_settings;
create policy settings_admin on public.alert_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists recipients_admin on public.alert_recipients;
create policy recipients_admin on public.alert_recipients for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Alertas e resumos: o admin lê (view_alerts), só o master apaga.
drop policy if exists alerts_admin_delete on public.alerts;
create policy alerts_admin_delete on public.alerts for delete to authenticated using (public.is_admin());
drop policy if exists summaries_admin_delete on public.triage_summaries;
create policy summaries_admin_delete on public.triage_summaries for delete to authenticated using (public.is_admin());

-- Histórico de uso: o admin com delete_history apaga o dos outros, nunca o do master.
drop policy if exists sessions_admin_delete on public.usage_sessions;
create policy sessions_admin_delete on public.usage_sessions for delete to authenticated
  using (public.is_admin() or (public.has_perm('delete_history') and not public.is_master_user(user_id)));
drop policy if exists uevents_admin_delete on public.usage_events;
create policy uevents_admin_delete on public.usage_events for delete to authenticated
  using (public.is_admin() or (public.has_perm('delete_history') and not public.is_master_user(user_id)));

-- Eventos: quem não é o master não cria, altera nem apaga evento em nome do master.
drop policy if exists events_write on public.events;
create policy events_write on public.events for all to authenticated
  using (public.is_staff() and (public.is_admin() or created_by is null or not public.is_master_user(created_by)))
  with check (public.is_staff() and (public.is_admin() or created_by is null or not public.is_master_user(created_by)));
