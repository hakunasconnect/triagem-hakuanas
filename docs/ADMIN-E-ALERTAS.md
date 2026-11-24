# Admin, login do triador e alertas por WhatsApp

Atualizado em 23/11/2026. Produção: https://triagemhakunas.vercel.app (app) e `/admin` (painel).
Repositório oficial: `hakunasconnect/triagem-hakuanas` (cada envio à `main` publica sozinho na Vercel).

## Decisão do responsável (registrada em 23/11/2026)

O Dr. Edson Barroso é o médico responsável e o **único admin master**. Os dados dos participantes já foram
coletados em planilhas e o app apenas ajuda a julgar a triagem. Por decisão dele, **a proibição de enviar dados
de saúde à nuvem não se aplica a este fluxo**: alertas de risco (vermelho/preto) e o resumo da triagem são
enviados por WhatsApp (Evolution) e guardados no Supabase, com leitura só do admin master. O restante do app
continua local e offline.

## Peças

| Peça | Onde | O que faz |
|---|---|---|
| App de triagem | `src/app.js` | Importa planilhas, calcula cor/faixa (motor determinístico), login opcional do triador |
| Registro de uso | `src/telemetry.js` | Sessões e ações **anônimas** (sem dado de participante) no Supabase |
| Painel admin | `src/admin/*` → `dist/admin.html` | Métricas, usuários, alertas, destinatários, conexão do WhatsApp |
| Alertas | `api/alert.js` + `src/alerts/*` | Aviso de quem está triando, alerta de risco, resumo, QR do WhatsApp |
| Usuários | `api/users.js` + `src/users/handler.js` | Criar/editar/trocar senha/apagar usuários (só admin master) |
| Banco | `supabase/migrations/0001…0009` | Tabelas, RLS, um único admin master |

## O que chega no WhatsApp

1. **Quem está triando**: ao entrar no app e ao iniciar a triagem (importação).
2. **Alerta individual** (vermelho/preto) ao salvar uma ficha: nome, idade, motivos, telefone, e-mail.
3. **Resumo da triagem**, logo após a importação e ao gerar relatório (sem repetir se nada mudou): totais por cor e,
   caso a caso, pretos e depois vermelhos com nome, idade, telefone, e-mail e motivos.
   Todas as mensagens dizem "requer avaliação humana (não é diagnóstico)". Cor, faixa e motivos vêm do motor
   determinístico (`src/core.js`); nada é inferido por IA.

## Papéis e permissões

| Papel | Quantos | O que faz |
|---|---|---|
| Admin master | **1** (o banco recusa um segundo) | Tudo. Cria admins, define o que cada admin pode, e só ele altera administradores. |
| Admin | vários | Padrão: tudo liberado, exceto o que é do admin master (abaixo). O admin master liga/desliga cada permissão. **Nunca** altera, rebaixa, troca a senha ou apaga o admin master, nem outro admin. |
| Coordenador / Triador | vários | Usam o app; o triador pode fazer login para registrar uso e identificar o relatório. |

Permissões do admin (chaves em `profiles.permissions`, padrão = liberado): `view_metrics`, `view_alerts`,
`manage_users` (só triadores e coordenadores), `delete_history` (só o histórico de uso de quem não é o admin master).

**Só do admin master (nenhum admin recebe, nem com permissão):** a conexão do WhatsApp e o teste de envio, a lista de
quem recebe os alertas, apagar alertas e resumos, os eventos que ele criou e o histórico de uso dele. O admin pode **ler**
alertas, resumos e métricas. A regra vale no banco (migração `0008`, RLS) e no servidor (`MASTER_ONLY` em `src/users/perms.js`).
A regra vale no banco (RLS, função `has_perm()`) e nas funções `/api/users` e `/api/alert`; a tela só esconde o que não é permitido.
Todo usuário novo nasce com senha provisória e **troca obrigatória** no primeiro acesso.

## Regras de segurança

- **Um único admin master** (índice único no banco). Ninguém cria outro; o papel dele não pode ser rebaixado pelo painel.
- Só o admin master lê alertas, resumos, destinatários e a configuração da Evolution; gravação só pelo servidor.
- Chaves (`SUPABASE_SERVICE_ROLE_KEY`, `EVOLUTION_API_KEY`) ficam **só como segredos da Vercel**; nunca no código.
  A chave anon do Supabase é pública por desenho (protegida por RLS).
- Usuários criados nascem com senha provisória e **troca obrigatória** no primeiro acesso.
- O histórico de auditoria (`audit_log`) é somente leitura, nem o admin o apaga pelo painel.

## Variáveis de ambiente (Vercel, produção)

- `SUPABASE_SERVICE_ROLE_KEY` — chave de serviço do projeto `wwfkazbjiutihtexqknm`.
- `EVOLUTION_API_KEY` — chave global da Evolution (`https://evo.n8ndredson.com`). Se for trocada no servidor da
  Evolution, atualizar aqui (`vercel env add EVOLUTION_API_KEY production --sensitive`).

A instância do WhatsApp se chama `triagem-hakunas` e é criada sozinha pelo botão "Conectar WhatsApp" do painel.

## Verificação (rodar após publicar)

```
node --test tests/*.test.mjs                    # unitários (npm test)
node scripts/verify-rls.mjs                     # isolamento do banco
node scripts/verify-alert-api.mjs               # /api/alert no site publicado
node scripts/verify-whatsapp-connect.mjs        # QR / estado do WhatsApp
node scripts/verify-admin-role.mjs              # papel admin: permissões e proteção do admin master (verificações do papel admin e da proteção do admin master)
node tests/browser-admin.mjs                    # painel no Chromium real (CHROME_PATH, SHOTS_DIR)
node tests/browser-admin-stub.mjs               # /admin no Chromium (celular) com respostas simuladas: sem token, sem dados reais
node tests/browser-telemetry.mjs                # login do triador + registro de uso no app publicado
```

Todos exigem `SUPABASE_ACCESS_TOKEN` (token pessoal do Supabase; revogue após o uso). Os testes ao vivo criam usuários
descartáveis (`@example.com`) e removem ao final; o do painel entra com uma sessão de teste do admin (sem criar
outro admin) e restaura a configuração do WhatsApp que encontrar.
