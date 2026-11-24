-- Inscrições enviadas pelo formulário Google (o próprio participante preenche). Dado identificável de saúde.
-- Gravação só pelo servidor (/api/intake, chave de serviço). Leitura direta: quem vê alertas (admin master e admin com view_alerts).
-- Apagar: só o admin master. O app lê e marca como importada pela função /api/intake (com o login do triador).
-- Idempotente: pode ser executada mais de uma vez.
create table if not exists public.form_submissions(
  id uuid primary key default gen_random_uuid(),
  response_id text not null unique check (char_length(response_id) between 1 and 200),
  received_at timestamptz not null default now(),
  top text not null default '' check (char_length(top) <= 20),
  participant_name text not null default '' check (char_length(participant_name) <= 200),
  record jsonb not null,
  answers jsonb not null default '[]'::jsonb,
  status text not null default 'novo' check (status in ('novo', 'importado')),
  imported_by uuid references auth.users(id) on delete set null,
  imported_at timestamptz
);
create index if not exists form_submissions_status_received on public.form_submissions(status, received_at);
alter table public.form_submissions enable row level security;
revoke all on public.form_submissions from anon, authenticated;
grant select, delete on public.form_submissions to authenticated;
drop policy if exists form_submissions_read on public.form_submissions;
create policy form_submissions_read on public.form_submissions for select to authenticated using (public.has_perm('view_alerts'));
drop policy if exists form_submissions_delete on public.form_submissions;
create policy form_submissions_delete on public.form_submissions for delete to authenticated using (public.is_admin());
