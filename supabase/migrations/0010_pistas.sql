-- Pistas de triagem e atribuição EXATA das inscrições do formulário ao triador e à pista de origem.
-- Pistas: cadastradas pelo admin (nome, local, TOP). Vínculo: o triador escolhe a pista e o servidor emite um código único (triador + pista).
-- O link do formulário do triador leva o código; ao receber a ficha o servidor confere o código no banco:
--   código válido => form_submissions.pista_link_id preenchido; ausente/inexistente/alterado => pista_link_id nulo ("sem identificação").
-- Tudo só pelo servidor (/api/intake com a chave de serviço): ninguém lê nem grava estas tabelas direto pelo navegador.
-- Idempotente: pode ser executada mais de uma vez.
create table if not exists public.pistas(
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  place text not null default '' check (char_length(place) <= 100),
  top text not null default '' check (char_length(top) <= 20),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (name, place, top)
);

create table if not exists public.pista_links(
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-HJKMNP-Z2-9]{10}$'),
  pista_id uuid not null references public.pistas(id) on delete restrict,
  triager_id uuid references auth.users(id) on delete set null, -- se o triador for removido, a pista da ficha continua registrada
  created_at timestamptz not null default now(),
  unique (pista_id, triager_id)
);
create index if not exists pista_links_triager on public.pista_links(triager_id);

alter table public.form_submissions add column if not exists pista_link_id uuid references public.pista_links(id) on delete set null;
alter table public.form_submissions add column if not exists pista_code text not null default '' check (char_length(pista_code) <= 40);
create index if not exists form_submissions_pista_link on public.form_submissions(pista_link_id);

alter table public.pistas enable row level security;
alter table public.pista_links enable row level security;
revoke all on public.pistas from anon, authenticated;
revoke all on public.pista_links from anon, authenticated;
-- sem policies: só a chave de serviço do servidor (que ignora RLS) lê e grava.
