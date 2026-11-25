/**
 * FICHA DE SAÚDE E INSCRIÇÃO — Legendários Hakunas
 * Cria o formulário no Google Forms da conta em que este script for executado, liga o envio por e-mail
 * e o envio das respostas ao app de triagem (https://triagemhakunas.vercel.app).
 *
 * COMO USAR (uma vez, logado na conta do Google da coordenação, a que vai receber as fichas):
 *  1. Acesse https://script.google.com e clique em "Novo projeto".
 *  2. Apague o código que vier e cole TODO este arquivo. Salve (Ctrl+S).
 *  3. No menu de funções (barra superior) escolha  criarFormulario  e clique em "Executar".
 *  4. Autorize quando o Google pedir (Forms, Planilhas, Gmail e "conectar a serviço externo").
 *  5. O link para os participantes responderem chega por e-mail e aparece em "Registro de execução".
 *
 * OUTRAS FUNÇÕES:  testarConexao  (confirma que o app aceita o envio, sem gravar nada)
 *                  reenviarTodas  (reenvia ao app todas as respostas já recebidas; o app ignora as repetidas)
 */

const CONFIG = {
  TOP: '1845',                                              // número do TOP: mude aqui se for outro
  EMAIL_DESTINO: '__EMAIL_DESTINO__',                       // quem recebe cada ficha por e-mail
  URL_APP: 'https://triagemhakunas.vercel.app/api/intake',  // recebimento no app de triagem
  SEGREDO: '__SEGREDO__',                                   // senha de envio ao app (não compartilhe este arquivo)
};

// Alternativa de "nenhuma" nas listas de marcar. Ela não vira critério no app.
const NENHUMA = 'Nenhuma das opções acima';
const SIM_NAO = ['Sim', 'Não'];
const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const RE_CPF = '^\\d{3}\\.?\\d{3}\\.?\\d{3}-?\\d{2}$';
const RE_FONE = '^[0-9+()\\s.-]{10,20}$';
const RE_PESO = '^\\d{2,3}([.,]\\d{1,2})?$';
const RE_ALTURA = '^(\\d{3}|\\d{2,3}[.,]\\d{1,2}|\\d[.,]\\d{1,2})$';
// Código da pista: 10 letras/números (sem I, L, O, 0, 1). Vem preenchido pelo link do triador; o servidor confere se ele existe.
const RE_PISTA = '^\\s*[A-HJKMNP-Za-hjkmnp-z2-9]{10}\\s*$';
const PISTA_TITULO = 'Código da pista (já vem preenchido pelo link do seu triador: não altere)';

// ---------------------------------------------------------------------------------------------
// As perguntas. Cada uma aponta para onde a resposta vai no app:
//   campo   -> campo de identificação/saúde da ficha;   extra -> "dados de origem" da ficha;
//   flags   -> critérios do protocolo (ids iguais aos do app);   prep -> as 4 perguntas de preparo.
// ---------------------------------------------------------------------------------------------
const PERGUNTAS = [
  { secao: 'Consentimento', descricao: 'Leia com atenção antes de responder.' },
  { tipo: 'aceite', titulo: 'Consentimento para uso dos meus dados (LGPD)', obrigatoria: true,
    ajuda: 'Autorizo os Legendários Hakunas a coletar, guardar e usar os dados informados neste formulário, inclusive dados sensíveis de saúde, exclusivamente para a avaliação de saúde e segurança, a triagem pré-participação, o atendimento em caso de intercorrência e a organização do TOP. Os dados serão acessados somente pela equipe de saúde e pela coordenação autorizada, não serão vendidos nem usados para outra finalidade. Posso pedir correção ou exclusão a qualquer momento pelo e-mail ' + CONFIG.EMAIL_DESTINO + '.',
    opcoes: ['Li e concordo'] },

  { secao: 'Seus dados', descricao: 'Preencha como está no seu documento.' },
  { campo: 'name', tipo: 'texto', titulo: 'Nome completo', obrigatoria: true },
  { campo: 'cpf', tipo: 'texto', titulo: 'CPF', obrigatoria: true, padrao: RE_CPF, erro: 'Informe os 11 números do CPF.' },
  { nascimento: true, tipo: 'data', titulo: 'Data de nascimento', obrigatoria: true },
  { extra: 'Estado civil', tipo: 'lista', titulo: 'Estado civil', obrigatoria: true, opcoes: ['Solteiro(a)', 'Casado(a)', 'União estável', 'Divorciado(a)', 'Viúvo(a)'] },
  { extra: 'Naturalidade', tipo: 'texto', titulo: 'Naturalidade (cidade, estado e país onde nasceu)', obrigatoria: true },
  { extra: 'Profissão', tipo: 'texto', titulo: 'Profissão atual', obrigatoria: true },
  { campo: 'email', tipo: 'texto', titulo: 'E-mail', obrigatoria: true, email: true },
  { telefone: true, tipo: 'texto', titulo: 'Telefone (com DDD)', obrigatoria: true, padrao: RE_FONE, erro: 'Informe o telefone com DDD.' },
  { whats: true, tipo: 'texto', titulo: 'WhatsApp (com DDD)', obrigatoria: true, padrao: RE_FONE, erro: 'Informe o WhatsApp com DDD.' },
  { extra: 'Endereço', tipo: 'texto', titulo: 'Endereço (rua, número, complemento e bairro)', obrigatoria: true },
  { extra: 'CEP', tipo: 'texto', titulo: 'CEP', obrigatoria: false },
  { extra: 'Cidade onde reside', tipo: 'texto', titulo: 'Cidade onde reside', obrigatoria: true },
  { campo: 'state', tipo: 'lista', titulo: 'Estado onde reside (UF)', obrigatoria: true, opcoes: UFS },

  { secao: 'Contato de emergência', descricao: 'Alguém que possamos acionar em caso de necessidade durante o evento.' },
  { emerg: 'nome', tipo: 'texto', titulo: 'Contato de emergência: nome completo', obrigatoria: true },
  { emerg: 'whats', tipo: 'texto', titulo: 'Contato de emergência: WhatsApp (com DDD)', obrigatoria: true, padrao: RE_FONE, erro: 'Informe o WhatsApp com DDD.' },
  { emerg: 'parentesco', tipo: 'texto', titulo: 'Contato de emergência: parentesco ou relação', obrigatoria: true },

  { secao: 'Medidas e informações gerais' },
  { campo: 'weight', tipo: 'texto', titulo: 'Peso (kg)', obrigatoria: true, padrao: RE_PESO, erro: 'Informe o peso em kg, por exemplo 82,5.' },
  { campo: 'height', tipo: 'texto', titulo: 'Altura (cm)', obrigatoria: true, padrao: RE_ALTURA, erro: 'Informe a altura em centímetros, por exemplo 178.' },
  { campo: 'blood', tipo: 'lista', titulo: 'Tipo sanguíneo', obrigatoria: true, opcoes: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Não sei'] },
  { extra: 'Plano de saúde', tipo: 'texto', titulo: 'Possui plano de saúde? Qual?', obrigatoria: false, ajuda: 'Se não tiver, deixe em branco.' },
  { extra: 'Parente no TOP', tipo: 'texto', titulo: 'Algum parente participa deste TOP? Quem?', obrigatoria: false, ajuda: 'Se não, deixe em branco.' },

  { secao: 'Atestado de aptidão física', descricao: 'Obrigatório para todos: atestado de médico cardiologista. Menos de 40 anos: eletrocardiograma. 40 anos ou mais: teste ergométrico. Vale 1 ano. Ninguém participa sem o atestado válido no check-in.' },
  { atestado: 'status', tipo: 'escolha', titulo: 'Você já tem o Atestado de Aptidão Física válido?', obrigatoria: true, opcoes: ['Sim, tenho e está dentro da validade', 'Estou providenciando', 'Ainda não'] },
  { atestado: 'exame', tipo: 'escolha', titulo: 'Qual exame você fez ou fará?', obrigatoria: true, opcoes: ['Eletrocardiograma (menos de 40 anos)', 'Teste ergométrico (40 anos ou mais)', 'Ainda não sei'] },
  { atestado: 'data', tipo: 'data', titulo: 'Data de emissão do atestado (se já tiver)', obrigatoria: false },

  { secao: 'Preparo físico' },
  { prep: 'activity', fitness: true, tipo: 'escolha', titulo: 'Você realiza atividade física regularmente?', obrigatoria: true,
    valores: [['0', 'Sim, 3 ou mais vezes por semana'], ['1', 'Sim, 1 a 2 vezes por semana'], ['2', 'Raramente'], ['3', 'Não realizo atividade física']] },
  { prep: 'walk', tipo: 'escolha', titulo: 'Você consegue caminhar pelo menos 10 km sem parar por fadiga excessiva?', obrigatoria: true,
    valores: [['0', 'Sim'], ['1', 'Não tentei'], ['2', 'Não']] },
  { prep: 'prior', tipo: 'escolha', titulo: 'Você já participou de caminhadas longas?', obrigatoria: true, valores: [['0', 'Sim'], ['1', 'Não']] },
  { prep: 'tetanus', tipo: 'escolha', titulo: 'Sua vacina contra tétano está vigente?', obrigatoria: true, valores: [['0', 'Sim'], ['1', 'Não / não sei']] },

  { secao: 'Histórico de saúde', descricao: 'Marque tudo o que você tem ou já teve.' },
  { flags: true, tipo: 'caixas', titulo: 'O que você tem ou já teve?', obrigatoria: true, ajuda: 'Se não tiver nenhum, marque "' + NENHUMA + '".',
    opcoes: [['htn', 'Hipertensão (pressão alta)'], ['chol', 'Colesterol alto'], ['heart', 'Problemas cardíacos (arritmias, sopros, cirurgia, válvulas)'], ['effort', 'Dor no peito ao caminhar ou fazer esforço'], ['syncope', 'Desmaios sem causa clara'], ['dm1', 'Diabetes tipo 1'], ['dm2', 'Diabetes tipo 2'], ['insulin', 'Resistência à insulina']] },
  { campo: 'medical', tipo: 'paragrafo', titulo: 'Antecedentes pessoais: doenças, cirurgias, fraturas, internações ou dores relatadas', obrigatoria: true, ajuda: 'Se não houver, escreva NENHUM.' },
  { campo: 'condition', tipo: 'paragrafo', titulo: 'Você sofre ou já sofreu de alguma doença ou condição de saúde? Qual?', obrigatoria: true, ajuda: 'Se não, escreva NENHUMA.' },
  { campo: 'health', tipo: 'paragrafo', titulo: 'Possui algum outro problema de saúde? Qual?', obrigatoria: true, ajuda: 'Se não, escreva NENHUM.' },
  { extra: 'Antecedentes familiares', tipo: 'paragrafo', titulo: 'Antecedentes familiares (pais e avós): problemas cardíacos, diabetes, morte súbita, outros', obrigatoria: true, ajuda: 'Se não souber ou não houver, escreva NENHUM.' },

  { secao: 'Medicamentos e alergias' },
  { flags: true, tipo: 'caixas', titulo: 'Medicamentos em uso (marque os que se aplicam)', obrigatoria: true, ajuda: 'Se não usa nenhum destes, marque "' + NENHUMA + '".',
    opcoes: [['bpmed', 'Para pressão alta'], ['dmmed', 'Para diabetes'], ['cholmed', 'Para colesterol'], ['steroid', 'Corticoides'], ['anticoag', 'Anticoagulantes'], ['psychmed', 'Antidepressivos ou ansiolíticos'], ['inhaler', 'Inaladores para asma']] },
  { campo: 'medication', tipo: 'paragrafo', titulo: 'Quais medicamentos você usa? Informe nome, dose e para que serve', obrigatoria: true, ajuda: 'Se não usa nenhum, escreva NENHUM.' },
  { campo: 'allergy', tipo: 'paragrafo', titulo: 'Alergias (inseto, planta, alimento, medicamento ou outra): qual?', obrigatoria: true, ajuda: 'Se não tiver, escreva NENHUMA.' },

  { secao: 'Sintomas atuais' },
  { flags: true, tipo: 'caixas', titulo: 'Você sente algum destes sintomas atualmente?', obrigatoria: true, ajuda: 'Se nenhum, marque "' + NENHUMA + '".',
    opcoes: [['breath', 'Falta de ar ao caminhar'], ['chest', 'Dor no peito'], ['palpitations', 'Palpitações fortes'], ['dizzy', 'Tontura ou desmaios'], ['edema', 'Inchaço nas pernas'], ['fever', 'Febre ou doença aguda'], ['pain', 'Dor em joelho, tornozelo ou costas ao caminhar']] },

  { secao: 'Situações que a equipe médica precisa avaliar', descricao: 'Marque com sinceridade: a equipe médica decide, caso a caso, com você e com seus documentos.' },
  { flags: true, tipo: 'caixas', titulo: 'Alguma destas situações se aplica a você?', obrigatoria: true, ajuda: 'Se nenhuma, marque "' + NENHUMA + '".',
    opcoes: [['surgery', 'Fiz grande cirurgia nos últimos 3 meses'], ['minimal', 'Sinto dor no peito ao mínimo esforço'], ['recentSyncope', 'Tive síncope (desmaio ou perda de consciência) recentemente'], ['uncontrolledHeart', 'Tenho doença cardíaca não controlada'], ['uncontrolledDM', 'Tenho diabetes tipo 1 sem controle estrito'], ['severeAsthma', 'Tenho asma severa mal controlada'], ['anaphylaxis', 'Tenho alergia grave (anafilaxia) e não tenho autoinjetor de adrenalina'], ['severePsych', 'Tenho problema psiquiátrico grave']] },
  { flags: true, tipo: 'caixas', titulo: 'Outros fatores', obrigatoria: true, ajuda: 'Se nenhum, marque "' + NENHUMA + '".',
    opcoes: [['seizure', 'História de convulsão'], ['implant', 'Tenho implante (stent, marca-passo, prótese, parafusos ou similar)'], ['disease', 'Tenho outra doença que a equipe médica precisa avaliar'], ['surgicalLimit', 'Tenho limitação por cirurgia anterior']] },

  { secao: 'PAR-Q (prontidão para atividade física)', descricao: 'Responda Sim ou Não a cada pergunta.' },
  { parq: 1, tipo: 'escolha', titulo: 'PAR-Q 1: Alguma vez foi mencionado que você tem algum problema cardíaco ou que só poderá fazer atividade física com recomendação médica?', obrigatoria: true, opcoes: SIM_NAO },
  { parq: 2, tipo: 'escolha', titulo: 'PAR-Q 2: Você sente dor ou desconforto no peito quando faz atividades físicas?', obrigatoria: true, opcoes: SIM_NAO },
  { parq: 3, tipo: 'escolha', titulo: 'PAR-Q 3: Nos últimos meses você tem sentido dor ou desconforto no peito mesmo sem fazer atividades físicas?', obrigatoria: true, opcoes: SIM_NAO },
  { parq: 4, tipo: 'escolha', titulo: 'PAR-Q 4: Você perde o equilíbrio em virtude de tonturas ou alguma vez já ficou inconsciente?', obrigatoria: true, opcoes: SIM_NAO },
  { parq: 5, tipo: 'escolha', titulo: 'PAR-Q 5: Você tem problemas ósseos, articulares ou de coluna que pioram quando você pratica atividades físicas?', obrigatoria: true, opcoes: SIM_NAO },
  { parq: 6, tipo: 'escolha', titulo: 'PAR-Q 6: Seu médico já prescreveu medicamentos para pressão arterial ou problemas cardíacos?', obrigatoria: true, opcoes: SIM_NAO },
  { parq: 7, tipo: 'escolha', titulo: 'PAR-Q 7: Você tem qualquer outra razão conhecida para não praticar atividades físicas?', obrigatoria: true, opcoes: SIM_NAO },

  { secao: 'Hábitos e alimentação' },
  { extra: 'Hábito de fumar', tipo: 'escolha', titulo: 'Hábito de fumar (atual)', obrigatoria: true, opcoes: ['Não fumo', 'Fumo', 'Parei de fumar'] },
  { extra: 'Uso de drogas ou entorpecentes', tipo: 'escolha', titulo: 'Uso de drogas ou entorpecentes (atual)', obrigatoria: true, opcoes: ['Não uso', 'Uso', 'Já usei'] },
  { extra: 'Bebidas alcoólicas', tipo: 'escolha', titulo: 'Consumo de bebidas alcoólicas', obrigatoria: true, opcoes: ['Não bebo', 'Socialmente', 'Frequentemente'] },
  { extra: 'Tipo de alimentação', tipo: 'texto', titulo: 'Tipo de alimentação atual', obrigatoria: false },
  { extra: 'Restrição alimentar', tipo: 'texto', titulo: 'Tem alguma restrição alimentar? Qual?', obrigatoria: false, ajuda: 'Se não, deixe em branco.' },
  { campo: 'diet', tipo: 'texto', titulo: 'Precisa de alguma dieta especial por razão médica? Qual?', obrigatoria: false, ajuda: 'Se não, deixe em branco.' },
  { extra: 'Horas sentado por dia', tipo: 'lista', titulo: 'Quantas horas por dia você passa sentado(a)?', obrigatoria: false, opcoes: ['Menos de 4 horas', 'De 4 a 8 horas', 'Mais de 8 horas'] },
  { extra: 'Objetivo', tipo: 'paragrafo', titulo: 'Qual o seu principal objetivo com esta experiência?', obrigatoria: false },
  { campo: 'important', tipo: 'paragrafo', titulo: 'Há alguma outra informação médica importante que a equipe deva saber?', obrigatoria: false },

  { secao: 'Declaração' },
  { tipo: 'aceite', titulo: 'Declaração de veracidade', obrigatoria: true,
    ajuda: 'Declaro que as informações acima são verdadeiras e que estou ciente de que omitir ou informar dados incorretos pode colocar minha saúde e a de outras pessoas em risco. Sei que este formulário não substitui o Atestado de Aptidão Física nem a avaliação da equipe médica no check-in.',
    opcoes: ['Declaro que as informações são verdadeiras'] },
  { pista: true, tipo: 'texto', titulo: PISTA_TITULO, obrigatoria: true, padrao: RE_PISTA, erro: 'Use o link enviado pelo seu triador: o código tem 10 letras e números e não deve ser alterado.',
    ajuda: 'Este código identifica o triador e a pista que vão atender você. Ele já vem preenchido pelo link que o seu triador enviou: não altere. Se estiver vazio, peça o link correto a ele.' },
];

// ----------------------------------------------------------------- criação do formulário
function criarFormulario() {
  if (CONFIG.EMAIL_DESTINO.indexOf('__') >= 0 || CONFIG.SEGREDO.indexOf('__') >= 0) throw new Error('Preencha EMAIL_DESTINO e SEGREDO em CONFIG antes de executar.');
  const props = PropertiesService.getScriptProperties();
  const existente = props.getProperty('FORM_ID');
  if (existente) {
    const f = FormApp.openById(existente);
    Logger.log('O formulário já foi criado. Link para responder: ' + f.getPublishedUrl() + '  |  Edição: ' + f.getEditUrl());
    return;
  }
  const form = FormApp.create('Ficha de Saúde e Inscrição — TOP ' + CONFIG.TOP + ' — Legendários Hakunas');
  form.setDescription('Preencha com atenção e sinceridade: estas informações servem para a sua segurança durante o TOP. O formulário leva cerca de 15 minutos. Ele não substitui o Atestado de Aptidão Física nem a avaliação da equipe médica no check-in; a liberação para o evento é decisão da equipe médica.')
    .setConfirmationMessage('Recebemos a sua ficha. A liberação para o evento depende do Atestado de Aptidão Física válido e da avaliação da equipe médica no check-in. Se algo mudar na sua saúde antes do evento, avise a coordenação.')
    .setAllowResponseEdits(false).setLimitOneResponsePerUser(false).setShowLinkToRespondAgain(false)
    .setProgressBar(true).setCollectEmail(false).setPublishingSummary(false).setAcceptingResponses(true);

  let primeiraSecao = true;
  for (const q of PERGUNTAS) {
    if (q.secao) {
      if (primeiraSecao) { form.addSectionHeaderItem().setTitle(q.secao).setHelpText(q.descricao || ''); primeiraSecao = false; }
      else form.addPageBreakItem().setTitle(q.secao).setHelpText(q.descricao || '');
      continue;
    }
    adicionarItem_(form, q);
  }

  const planilha = SpreadsheetApp.create('Respostas — Ficha de Saúde TOP ' + CONFIG.TOP);
  form.setDestination(FormApp.DestinationType.SPREADSHEET, planilha.getId());
  ScriptApp.newTrigger('aoEnviar').forForm(form).onFormSubmit().create();
  props.setProperty('FORM_ID', form.getId());

  const mensagem = 'Formulário criado.\n\nLink para os participantes responderem:\n' + form.getPublishedUrl() + '\n\nEdição do formulário:\n' + form.getEditUrl() + '\n\nPlanilha com as respostas:\n' + planilha.getUrl();
  Logger.log(mensagem);
  MailApp.sendEmail({ to: CONFIG.EMAIL_DESTINO, subject: 'Formulário da Ficha de Saúde criado — TOP ' + CONFIG.TOP, body: mensagem });
}

// Para o formulário JÁ CRIADO (o link dele NÃO muda): acrescenta no fim a pergunta do código da pista, se ela ainda não existir, e envia à
// coordenação o MODELO DE LINK com o código preenchido (o trecho __CODIGO__ é trocado pelo servidor, um código por triador e pista).
// Pode rodar de novo: não duplica a pergunta.
function prepararPistas() {
  if (CONFIG.EMAIL_DESTINO.indexOf('__') >= 0) throw new Error('Preencha EMAIL_DESTINO em CONFIG antes de executar.');
  const id = PropertiesService.getScriptProperties().getProperty('FORM_ID');
  if (!id) throw new Error('O formulário ainda não foi criado: execute criarFormulario primeiro.');
  const form = FormApp.openById(id);
  const q = PERGUNTAS.filter(function (p) { return p.pista; })[0];
  const existente = form.getItems().filter(function (i) { return i.getTitle() === q.titulo; })[0];
  const campo = existente ? existente.asTextItem() : adicionarItem_(form, q);
  const modelo = form.createResponse().withItemResponse(campo.createResponse('__CODIGO__')).toPrefilledUrl();
  const aviso = (existente ? 'A pergunta do código da pista já existia.' : 'A pergunta do código da pista foi acrescentada no fim do formulário.') + '\nO link para responder NÃO mudou.';
  Logger.log(aviso + '\nModelo de link das pistas (guarde na Vercel como FORM_LINK_TEMPLATE; não compartilhe): ' + modelo);
  MailApp.sendEmail({ to: CONFIG.EMAIL_DESTINO, subject: 'Modelo de link das pistas — TOP ' + CONFIG.TOP, body: aviso + '\n\nMODELO DE LINK (use como valor de FORM_LINK_TEMPLATE na Vercel; não compartilhe com participantes):\n' + modelo + '\n\nO trecho __CODIGO__ é trocado pelo app, um código para cada triador e pista.' });
}

function adicionarItem_(form, q) {
  let item;
  if (q.tipo === 'texto') {
    item = form.addTextItem();
    if (q.email) item.setValidation(FormApp.createTextValidation().setHelpText('Informe um e-mail válido.').requireTextIsEmail().build());
    else if (q.padrao) item.setValidation(FormApp.createTextValidation().setHelpText(q.erro || 'Valor inválido.').requireTextMatchesPattern(q.padrao).build());
  } else if (q.tipo === 'paragrafo') item = form.addParagraphTextItem();
  else if (q.tipo === 'data') item = form.addDateItem().setIncludesYear(true);
  else if (q.tipo === 'lista') item = form.addListItem().setChoiceValues(q.opcoes);
  else if (q.tipo === 'escolha') item = form.addMultipleChoiceItem().setChoiceValues(opcoesTexto_(q));
  else if (q.tipo === 'caixas') item = form.addCheckboxItem().setChoiceValues(opcoesTexto_(q).concat([NENHUMA]));
  else if (q.tipo === 'aceite') item = form.addCheckboxItem().setChoiceValues(q.opcoes);
  else throw new Error('Tipo de pergunta desconhecido: ' + q.tipo);
  item.setTitle(q.titulo).setRequired(!!q.obrigatoria);
  if (q.ajuda) item.setHelpText(q.ajuda);
  return item;
}

function opcoesTexto_(q) {
  if (q.valores) return q.valores.map(function (p) { return p[1]; });
  return (q.opcoes || []).map(function (o) { return Array.isArray(o) ? o[1] : o; });
}

// ----------------------------------------------------------------- resposta -> app e e-mail
function aoEnviar(e) {
  const montado = montarPayload_(e.response);
  const nome = montado.payload.fields.name || 'participante';
  // 1) E-mail primeiro: a ficha chega à coordenação mesmo que o app esteja fora do ar.
  try {
    MailApp.sendEmail({ to: CONFIG.EMAIL_DESTINO, subject: 'Nova ficha de saúde — ' + nome + ' — TOP ' + CONFIG.TOP, body: corpoEmail_(montado) });
  } catch (erro) { Logger.log('Falha ao enviar o e-mail: ' + erro); }
  // 2) App de triagem.
  const r = enviarAoApp_(montado.payload);
  if (!r.ok) {
    try {
      MailApp.sendEmail({ to: CONFIG.EMAIL_DESTINO, subject: 'ATENÇÃO: a ficha de ' + nome + ' NÃO chegou ao app de triagem',
        body: 'O envio ao app falhou (' + r.motivo + '). A ficha está no e-mail anterior e na planilha de respostas. Depois de corrigir, rode a função reenviarTodas no Apps Script: o app ignora as fichas repetidas.' });
    } catch (erro) { Logger.log('Falha ao avisar do erro: ' + erro); }
  }
}

function enviarAoApp_(payload) {
  try {
    const r = UrlFetchApp.fetch(CONFIG.URL_APP, { method: 'post', contentType: 'application/json', headers: { 'x-intake-secret': CONFIG.SEGREDO }, payload: JSON.stringify(payload), muteHttpExceptions: true });
    const codigo = r.getResponseCode();
    if (codigo >= 200 && codigo < 300) return { ok: true };
    return { ok: false, motivo: 'HTTP ' + codigo + ' ' + String(r.getContentText()).slice(0, 200) };
  } catch (erro) { return { ok: false, motivo: String(erro) }; }
}

function indexarPerguntas_() {
  const m = {};
  PERGUNTAS.forEach(function (q) { if (q.titulo) m[q.titulo] = q; });
  return m;
}

function formatarData_(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? m[3] + '/' + m[2] + '/' + m[1] : String(iso || '');
}

function montarPayload_(resposta) {
  const porTitulo = indexarPerguntas_();
  const fields = {}, extras = [], flags = [], prep = {}, answers = [];
  let nascimento = '', telefone = '', whats = '', atestado = {}, emerg = {}, fitness = '', pistaCode = '';
  const parqSim = [];
  resposta.getItemResponses().forEach(function (ir) {
    const titulo = ir.getItem().getTitle(), q = porTitulo[titulo];
    if (!q) return;
    const v = ir.getResponse();
    const texto = Array.isArray(v) ? v.join('; ') : String(v == null ? '' : v);
    answers.push({ q: titulo, v: texto });
    if (q.tipo === 'aceite') return;
    if (q.pista) { pistaCode = texto; return; }
    if (q.flags) {
      const pares = q.opcoes;
      (Array.isArray(v) ? v : [v]).forEach(function (rotulo) {
        const par = pares.filter(function (p) { return p[1] === rotulo; })[0];
        if (par && flags.indexOf(par[0]) < 0) flags.push(par[0]);
      });
      return;
    }
    if (q.prep) {
      const par = q.valores.filter(function (p) { return p[1] === texto; })[0];
      if (par) prep[q.prep] = par[0];
      if (q.fitness) fitness = texto;
      return;
    }
    if (q.parq) { if (texto === 'Sim') parqSim.push(q.parq); extras.push({ label: 'PAR-Q ' + q.parq, value: texto }); return; }
    if (q.nascimento) { nascimento = texto; extras.push({ label: 'Data de nascimento', value: formatarData_(texto) }); return; }
    if (q.telefone) { telefone = texto; return; }
    if (q.whats) { whats = texto; return; }
    if (q.emerg) { emerg[q.emerg] = texto; return; }
    if (q.atestado) { atestado[q.atestado] = q.atestado === 'data' ? formatarData_(texto) : texto; return; }
    if (q.campo) { if (texto) fields[q.campo] = texto; return; }
    if (q.extra && texto) extras.push({ label: q.extra, value: texto });
  });
  fields.phone = whats || telefone;
  if (telefone) extras.push({ label: 'Telefone', value: telefone });
  if (whats) extras.push({ label: 'WhatsApp', value: whats });
  if (emerg.nome) fields.emergency = emerg.nome + (emerg.whats ? ' - ' + emerg.whats : '') + (emerg.parentesco ? ' (' + emerg.parentesco + ')' : '');
  if (fitness) fields.fitness = fitness;
  const partesAtestado = [atestado.status, atestado.exame, atestado.data ? 'emitido em ' + atestado.data : ''].filter(Boolean);
  if (partesAtestado.length) fields.certificateText = partesAtestado.join(' · ');
  fields.notes = parqSim.length ? 'PAR-Q: resposta SIM nos itens ' + parqSim.join(', ') + '.' : 'PAR-Q: nenhum item com resposta SIM.';
  const payload = { responseId: resposta.getId(), submittedAt: resposta.getTimestamp().toISOString(), top: CONFIG.TOP, birthDate: nascimento, pistaCode: pistaCode, fields: fields, extras: extras, flags: flags, prep: prep, answers: answers };
  return { payload: payload, answers: answers };
}

function corpoEmail_(montado) {
  const p = montado.payload;
  const linhas = ['FICHA DE SAÚDE — TOP ' + CONFIG.TOP, 'Recebida em: ' + p.submittedAt, ''];
  montado.answers.forEach(function (a) { linhas.push(a.q + '\n   → ' + (a.v || '(não preenchido)')); });
  linhas.push('', 'Critérios assinalados pelo participante: ' + (p.flags.length ? p.flags.join(', ') : 'nenhum'), '',
    'Atenção: dados autodeclarados. A liberação para o evento depende do atestado e da avaliação da equipe médica.');
  return linhas.join('\n');
}

// ----------------------------------------------------------------- utilitários
function testarConexao() {
  const r = UrlFetchApp.fetch(CONFIG.URL_APP, { method: 'post', contentType: 'application/json', headers: { 'x-intake-secret': CONFIG.SEGREDO }, payload: JSON.stringify({ test: true }), muteHttpExceptions: true });
  Logger.log('Resposta do app: HTTP ' + r.getResponseCode() + ' ' + r.getContentText() + '   (esperado: HTTP 200 {"ok":true,"test":true})');
}

function reenviarTodas() {
  const form = FormApp.openById(PropertiesService.getScriptProperties().getProperty('FORM_ID'));
  let ok = 0, falhas = 0;
  form.getResponses().forEach(function (resposta) {
    const r = enviarAoApp_(montarPayload_(resposta).payload);
    if (r.ok) ok++; else { falhas++; Logger.log('Falhou: ' + r.motivo); }
  });
  Logger.log('Reenvio concluído: ' + ok + ' enviadas, ' + falhas + ' com falha. (As repetidas são ignoradas pelo app.)');
}
