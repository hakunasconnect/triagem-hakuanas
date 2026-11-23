-- Resumo de cada triagem enviado por WhatsApp: totais por cor. Só o admin master lê; gravação só pelo servidor.
create table if not exists public.triage_summaries(
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  triager_id uuid references auth.users(id) on delete set null,
  event_label text not null default '' check (char_length(event_label)<=200),
  total int not null default 0,
  green int not null default 0,
  yellow int not null default 0,
  red int not null default 0,
  black int not null default 0
);
create index if not exists triage_summaries_created on public.triage_summaries(created_at desc);
alter table public.triage_summaries enable row level security;
revoke all on public.triage_summaries from anon, authenticated;
grant select on public.triage_summaries to authenticated;
drop policy if exists summaries_admin_read on public.triage_summaries;
create policy summaries_admin_read on public.triage_summaries for select to authenticated using (public.is_admin());
