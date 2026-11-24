# Execução — Triagem Hakunas

Estas são instruções do usuário adaptadas ao repositório; não constituem skills instaladas.

Antes de editar, ler estado/diff/branch/commits, TODO.md, docs/STATUS.md, docs/COMO-USAR.md, docs/import.md, package.json e módulos/testes pertinentes. Executar um item aberto por vez. Preservar alterações locais.

Não usar reset --hard, git clean, force-push, exclusão de branches ou rebase destrutivo. Não commitar, enviar, publicar nem fazer upload sem pedido. Antes de um checkpoint autorizado, conferir diff, branch, origem canônica e auto-publicação; se houver risco de publicação, pedir confirmação informada.

Seguir TDD: teste sintético falhando antes da correção, alteração mínima da causa, testes focados, pnpm test, pnpm build e git diff --check. Testar o HTM gerado em navegador real por file:// e viewport móvel quando permitido. Registrar bloqueios reais; DOM simulado não equivale a Chromium/Android/impressora. Não contornar políticas do ambiente.

Processar dados localmente. Não enviar dados de saúde a nuvem/API. Manter documentos pessoais fora de fixtures, logs, capturas e commits. Importação deve ter formatos explícitos, origem, prévia, normalização verificável, indicação de ambiguidades, mapeamento humano e rejeição integral em erro bloqueante. Não prometer reconhecimento universal nem inferir diagnósticos de texto livre.

Contrato operacional definido pelo usuário: idades válidas inteiras de 16–17 anos = vermelho; preto só com critério preto explícito independente; menores sem IMC/faixa adulta final; implante ambíguo exige revisão. Nenhum resultado é diagnóstico ou autorização para esforço. Não alterar score/faixas por suposição.

O código 1.1 já contém OCR local incorporado. O novo prompt descreve versão sem OCR; manter esta discrepância registrada na fila. Não ampliar OCR sem aprovação explícita nem remover recurso existente fora do item autorizado. Nenhum OCR remoto.

As cinco skills citadas (Git Guardrails, Planning With Files, Webapp Testing, Trail of Bits Security, Document Skills) não foram encontradas no catálogo na execução que criou este arquivo. Não alegar carregamento. Instalações futuras exigem revisar origem oficial, SKILL.md, licença, manutenção, compatibilidade e permissões, sem presumir os selos editoriais do guia como certificação.

No encerramento, registrar causa, arquivos, comandos/resultados, SHA apenas se checkpoint realmente ocorreu, limites não testados e próximo item. Manter documentação e evidências locais; sem publicação automática.

## Decisão do responsável — 23/11/2026 (admin, alertas e Supabase)

O usuário (Dr. Edson Barroso, médico responsável e único admin master) decidiu que a regra "Não enviar dados de saúde
a nuvem/API" **não se aplica ao fluxo de alertas e resumo da triagem**: os dados já foram coletados em planilhas e o app
apenas auxilia o julgamento. Nome, idade, telefone, e-mail e motivos de casos vermelhos/pretos são enviados por WhatsApp
(Evolution) e guardados no Supabase com acesso só do admin master. Detalhes e salvaguardas em `docs/ADMIN-E-ALERTAS.md`.
A regra de privacidade continua valendo para o restante do app e para qualquer envio a IA externa (Gemini): sem nova
autorização, não enviar dados de participantes a APIs de IA.
