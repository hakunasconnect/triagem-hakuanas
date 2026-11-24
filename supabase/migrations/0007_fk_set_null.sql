-- Apagar um usuário não pode ser bloqueado por registros que ele criou (auditoria, eventos): o autor vira nulo.
alter table public.audit_log drop constraint if exists audit_log_actor_id_fkey;
alter table public.audit_log add constraint audit_log_actor_id_fkey foreign key (actor_id) references auth.users(id) on delete set null;
alter table public.events drop constraint if exists events_created_by_fkey;
alter table public.events add constraint events_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null;
