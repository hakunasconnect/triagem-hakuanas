# Formulário Google: ficha de saúde preenchida pelo participante

O participante preenche sozinho a ficha no Google Forms. Cada resposta:

1. **chega por e-mail** à coordenação (com todas as respostas);
2. **fica guardada no app de triagem** (tabela `form_submissions` do Supabase), de onde o triador a traz para a sessão em
   **Participantes → Inscrições do formulário**;
3. fica também na **planilha de respostas** do próprio Google Forms (cópia de segurança).

```
Participante ── Google Forms ──┬─► e-mail para a coordenação (MailApp)
                               ├─► planilha de respostas (Google)
                               └─► POST /api/intake  (cabeçalho x-intake-secret)
                                      └─► Supabase: form_submissions
Triador (logado no site) ── Inscrições do formulário ── /api/intake (Bearer) ── importador do app ── ficha do participante
```

## Colocar no ar (uma vez)

1. **Banco:** no Supabase (SQL Editor) rode `supabase/migrations/0009_form_submissions.sql`. Pode rodar mais de uma vez.
2. **Servidor:** a variável `FORM_INTAKE_SECRET` (sensível) já foi criada na Vercel. Ela só vale em deploys feitos depois de criada.
3. **Formulário:** entre no Google com a conta da coordenação, abra https://script.google.com, crie um projeto, cole o conteúdo de
   `formulario-hakunas-APPS-SCRIPT.gs` (cópia personalizada, **fora do repositório**, com o e-mail e o segredo preenchidos) e execute
   `criarFormulario`. Autorize quando o Google pedir (Forms, Planilhas, Gmail, serviço externo). O link para os participantes
   chega por e-mail e aparece no "Registro de execução".
4. **Conferir a ligação com o app:** execute `testarConexao`. O esperado é `HTTP 200 {"ok":true,"test":true}` (nada é gravado).
5. Teste preenchendo o formulário uma vez e conferindo e-mail, planilha e a janela do app.

O modelo do repositório (`integracoes/google-forms/formulario-hakunas.gs`) traz `__EMAIL_DESTINO__` e `__SEGREDO__` no lugar
dos valores reais, porque o repositório é **público**. Nunca coloque o segredo nele.

## Pistas: cada ficha chega com o triador e a pista de origem

Para a ficha **nunca** cair no triador errado (várias pistas, triadores e locais ao mesmo tempo):

- O **admin** cadastra as pistas (nome, local, TOP) em `/admin` → **Pistas**.
- Cada **triador**, logado no site, abre **Participantes → 📍 Minha pista**, escolhe a pista na lista e recebe o **próprio link** do formulário
  (copiar ou WhatsApp). O link leva um **código único** (10 letras e números) do par triador + pista.
- O formulário tem a pergunta obrigatória **Código da pista**, já preenchida pelo link; o Google recusa valor fora do formato.
- Quando a ficha chega, o servidor **confere o código no banco**. Válido: a ficha fica ligada ao triador e à pista. Ausente, inexistente ou
  alterado: **sem identificação**, nunca atribuída a alguém no chute. Se a conferência falhar (erro do banco), a ficha **não é gravada**:
  a coordenação recebe o e-mail "ATENÇÃO" e `reenviarTodas` repete o envio.
- O triador vê e importa **só as fichas da própria pista**. Coordenador, admin e admin master veem todas, com a pista e o triador, e também as
  "sem identificação" (que não vêm marcadas: a coordenação decide de qual pista são).

### Ligar (nesta ordem)

1. **Banco:** no SQL Editor do Supabase rode `supabase/migrations/0010_pistas.sql` (pode rodar mais de uma vez). Conferência: a consulta
   `select (select count(*) from information_schema.tables where table_schema='public' and table_name in ('pistas','pista_links')) as tabelas, (select count(*) from information_schema.columns where table_schema='public' and table_name='form_submissions' and column_name in ('pista_link_id','pista_code')) as colunas, (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('pistas','pista_links') and c.relrowsecurity) as rls;`
   deve devolver **2, 2, 2**. **Faça isto antes de publicar o site**: o código novo consulta essas tabelas.
2. **Site:** publicar (a Vercel atualiza sozinha a cada envio ao GitHub).
3. **Formulário:** no Apps Script, atualize o código do script (mantendo o seu e-mail e o segredo) e execute `prepararPistas`. Ela acrescenta a pergunta
   do código no **fim do formulário já criado, sem mudar o link dele**, e envia por e-mail à coordenação o **modelo de link** (termina em `=__CODIGO__`).
4. **Vercel:** crie a variável `FORM_LINK_TEMPLATE` (sensível) com esse modelo e faça um novo deploy. Sem ela o app mostra o código, mas avisa que o link não está configurado.
5. No `/admin`, cadastre as pistas.
6. **Teste real com dois aparelhos:** dois triadores, duas pistas. Cada ficha deve aparecer só para o triador certo, e uma ficha aberta pelo link
   genérico (sem código) deve ser barrada pelo próprio Google.

### Limites

- O Google Forms não esconde um campo preenchido: o participante vê o código e poderia mexer nele. Código alterado vira "sem identificação"; só seria
  atribuído errado se ele colasse o código **válido** de outra pista, que ele não consegue adivinhar (10 caracteres, 31 possibilidades cada).
- A conferência foi provada com um banco simulado (`tests/intake-pistas.test.mjs`) e a migração, com Postgres local; a primeira prova com o Supabase e
  o Google reais é o teste de dois aparelhos acima. `prepararPistas` só foi testada num simulador do Google.
- O link genérico do formulário deixa de servir para os participantes (a pergunta do código é obrigatória): cada triador usa o **seu** link.

## O que o formulário pergunta

Vem do **Manual de Alinhamento Estratégico 2026** (questionário com pontuação, exclusões, PAR-Q de 7 itens, atestado por faixa
etária, anamnese) e da planilha *Relatório atualizado top 1845* (CPF, nome, e-mail, telefone, idade, estado, cidade, profissão,
peso, altura, condicionamento, condição médica, medicamentos, restrição alimentar, parente no TOP, contato de emergência,
tipo sanguíneo, doenças, outros problemas, dieta, informação médica, plano de saúde, alergias), mais nome completo, endereço,
e-mail, telefone e WhatsApp.

Cada critério do protocolo usa o **mesmo identificador do app** (`htn`, `bpmed`, `breath`, `surgery`…). Um teste
(`tests/google-forms-script.test.mjs`) garante que o formulário e o app não se desencontrem: se o protocolo do app mudar, ele falha.

- O formulário **não calcula cor nem faixa**: só coleta. A classificação continua sendo do app, na ficha, e a liberação é decisão
  da equipe médica.
- Os campos de "nenhuma" são obrigatórios nas listas de marcar, para que "não respondeu" e "não tenho" não se confundam.
- Nenhuma seção nasce como "revisada com o participante": os dados são **autodeclarados** e a ficha traz esse aviso.

## No app

Só no **site** (https://triagemhakunas.vercel.app), com login de triador: o arquivo offline tem política de segurança que
proíbe conexão externa, de propósito. A janela lista as inscrições novas; marca a válida, bloqueia a inválida com o motivo
(por exemplo, idade abaixo de 16) e avisa quem já está na lista (mesmo CPF, e-mail ou nome com o mesmo telefone). Ao importar:
a ficha entra na sessão como qualquer importação de planilha (com prévia de avisos), o servidor marca a inscrição como importada e
o aviso de início de triagem segue o mesmo caminho da importação de arquivo.

## Privacidade (LGPD)

- O formulário abre com um **consentimento** (texto aprovado pelo responsável em 24/11/2026, na versão original; ele não cita o controlador, o prazo de guarda nem a passagem dos dados pelo Google) e termina com declaração de veracidade.
- O dado fica no Google (formulário e planilha), no e-mail da coordenação e no Supabase. No Supabase: gravação só pelo servidor,
  leitura direta só do admin master e do admin com `view_alerts`, apagar só o admin master. Os triadores leem pela função do servidor.
- O segredo de envio fica na Vercel (sensível) e no script, que mora na conta Google da coordenação: quem editar o formulário vê o segredo.
- Esses dados **não** vão a nenhuma IA externa.

## Limites e solução de problemas

- **E-mails:** conta Google comum envia até ~100 e-mails por dia pelo script. Acima disso o e-mail falha, mas a planilha e o app continuam recebendo.
- **App fora do ar ou segredo errado:** a coordenação recebe um e-mail "ATENÇÃO: a ficha … NÃO chegou ao app". Depois de corrigir, rode
  `reenviarTodas`: o servidor ignora as fichas repetidas (cada resposta tem um id único).
- **Trocar o segredo:** gere outro, atualize `FORM_INTAKE_SECRET` na Vercel (novo deploy) e o `SEGREDO` no script.
- **Mudou o número do TOP:** edite `CONFIG.TOP` no script (vale para o título e para o registro das respostas novas).
- **Duas respostas da mesma pessoa:** chegam como duas inscrições; o app avisa quando o CPF, o e-mail ou o nome com telefone já está na lista.

## Verificação

```
node --test tests/intake-*.test.mjs tests/google-forms-script.test.mjs tests/telemetry-intake.test.mjs
npm run build && CHROME_PATH=... node tests/browser-forms-import.mjs     # janela do app no Chromium, rede simulada
```

O script do Google é executado, nos testes, num simulador do Google Apps Script (estrutura do formulário, contrato com o app,
cadeia resposta → e-mail → servidor → participante). Em 24/11/2026 foi executado no Google de verdade, na conta da coordenação: `criarFormulario` concluiu sem erro, `testarConexao` devolveu
`HTTP 200 {"ok":true,"test":true}` e uma inscrição de teste com dados inventados chegou ao e-mail, à planilha e à janela
"Inscrições do formulário" do site (relato do responsável). O gatilho `aoEnviar` disparou sozinho (tela Execuções do Apps Script: tipo
Acionar, concluído em 6 s, 0% de erro) e o e-mail "Nova ficha de saúde" está na caixa da coordenação. A importação também funcionou em produção: a inscrição ficou com status `importado` no banco e o participante entrou na lista da
sessão (lista colada pelo responsável e leitura do banco). Não conferido: o aviso de início de triagem no WhatsApp e o aviso
"autodeclarado" na ficha. Antes, o
script só havia rodado no simulador.
