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

- O formulário abre com um **consentimento** (texto proposto, a ser revisado pelo responsável) e termina com declaração de veracidade.
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
cadeia resposta → e-mail → servidor → participante). **Não** foi executado no Google de verdade por quem o escreveu: o primeiro
uso real (`criarFormulario` e `testarConexao`) é a prova final.
