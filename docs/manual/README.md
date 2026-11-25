# Manual do Triador (PDF)

Fontes do manual em PDF entregue aos hakunas que fazem a triagem. O texto está em `corpo.html`, o estilo em `estilo.css` e as figuras
(telas reais do app, com participantes inventados) em `img/`. O PDF de uso interno (`saida/`) **não** é versionado: é gerado por `build.mjs`.
Só a **versão pública** (sem o link do formulário) fica no Git, em `publicado/`, porque é ela que o app abre e baixa (ver "Versão que vai para o site").

## Gerar o PDF

Tudo dentro de `docs/manual`, com o Chromium do Playwright (`CHROME_PATH` ou o `chromium-1248` do `ms-playwright`).

1. `pnpm build` na raiz: as telas são tiradas do `dist/index.html`.
2. Link do formulário: ele **não fica no repositório** (é público). Crie `docs/manual/link-formulario.local.txt` com o link de resposta
   (termina em `/viewform`), ignorado pelo Git, ou use a variável `LINK_FORMULARIO`. O build recusa outro formato.
3. `node build.mjs` gera `saida/Manual-do-Triador-Triagem-Hakunas.pdf` e repete a paginação até o sumário ficar estável.
4. `node verificar.mjs saida/Manual-do-Triador-Triagem-Hakunas.pdf` confere: sem marcadores `{{`, sem `undefined`, sem caractere quebrado
   e com os números de página do sumário batendo com as páginas reais.

## Versão que vai para o site

O app tem o painel "Manual do triador" (Abrir / Baixar PDF). O arquivo servido é `https://triagemhakunas.vercel.app/manual/Manual-do-Triador-Triagem-Hakunas.pdf`
e vem de `docs/manual/publicado/Manual-do-Triador-Triagem-Hakunas.pdf`, que o `npm run build` copia para `dist/manual/` (o build falha se ele faltar).

1. Como o site é **público**, essa versão não pode conter o link do formulário: gere com `node build.mjs --publico` (não lê o link; no lugar
   entra "Peça o link à coordenação do TOP").
2. Copie `saida/Manual-do-Triador-Triagem-Hakunas-publico.pdf` para `publicado/Manual-do-Triador-Triagem-Hakunas.pdf`.
3. `tests/manual-no-app.test.mjs` extrai o texto do PDF e falha se aparecer `docs.google.com`, `viewform` ou o id do formulário.
4. Só troque o PDF publicado quando o app ou o texto mudarem: cada versão acrescenta ~4,7 MB ao histórico do repositório.

## Quando o app mudar

- Telas: `node shots-desktop.mjs && node shots-mobile.mjs && node otimizar.mjs` (PNG em `shots/`, JPEG em `img/`). A rede é simulada:
  nenhum dado real é tocado. Veja `shots-log.txt` e confira as marcas numeradas antes de gerar o PDF.
- Critérios (Apêndice A): `node capturar-abas.mjs` regrava os `aba-*.txt`; só `aba-book.txt` é usado pelo build.
- Texto: edite `corpo.html`. Reveja sempre os capítulos 7 (cores e exclusões) e 10 (WhatsApp) quando mudar cálculo ou alertas.
- O rodapé do PDF cita a versão do app (`v1.8.3`, em `build.mjs`): atualize junto.

## O que o manual não prova

- As telas de celular vieram de um Chromium emulando celular, não de um aparelho real, e nada foi impresso em impressora.
- A regra do atestado vem do Manual de Alinhamento Estratégico; a frequência de backup e o teste em modo avião são sugestões, marcadas assim no texto.
- O Apêndice A copia a aba "Critérios e fontes": fica desatualizado se os critérios forem editados no app sem regerar.
