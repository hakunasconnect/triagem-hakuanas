// Executa o script do Google Forms (integracoes/google-forms/formulario-hakunas.gs) num simulador do Google Apps Script
// e prova: a estrutura do formulário, o contrato com o app (ids dos critérios) e a cadeia completa
// resposta -> e-mail -> envio ao servidor -> normalização -> participante do app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeSubmission, FLAG_IDS } from '../src/intake/normalize.js';
import { submissionsToPreview } from '../src/intake/to-preview.js';

const MODELO = fs.readFileSync(new URL('../integracoes/google-forms/formulario-hakunas.gs', import.meta.url), 'utf8');
const EMAIL = 'coordenacao@exemplo.com', SEGREDO = 'segredo-de-teste-xyz';

function ambiente({ status = 200, rede = false, personalizar = true } = {}) {
  const st = { items: [], mails: [], fetches: [], triggers: [], props: {}, logs: [], responses: [], form: { calls: {} }, titulo: '' };
  const item = tipo => {
    const calls = {};
    const it = new Proxy({ tipo, calls }, { get: (t, p) => (p in t ? t[p] : (...a) => { (calls[p] ||= []).push(a); return it; }) });
    st.items.push(it); return it;
  };
  const form = new Proxy({}, { get: (_, p) => {
    if (/^add\w+Item$/.test(p)) return () => item(p);
    if (p === 'getId') return () => 'FORM123';
    if (p === 'getPublishedUrl') return () => 'https://forms.exemplo/responder';
    if (p === 'getEditUrl') return () => 'https://forms.exemplo/editar';
    if (p === 'getResponses') return () => st.responses;
    return (...a) => { (st.form.calls[p] ||= []).push(a); return form; };
  } });
  const validacao = () => { const c = {}; const v = new Proxy({}, { get: (_, p) => (p === 'build' ? () => c : (...a) => { c[p] = a; return v; }) }); return v; };
  const FormApp = { create: t => { st.titulo = t; return form; }, openById: () => form, createTextValidation: validacao, DestinationType: { SPREADSHEET: 'SPREADSHEET' } };
  const SpreadsheetApp = { create: () => ({ getId: () => 'SHEET1', getUrl: () => 'https://planilha.exemplo' }) };
  const ScriptApp = { newTrigger: fn => { const t = { forForm: () => t, onFormSubmit: () => t, create: () => { st.triggers.push(fn); } }; return t; } };
  const MailApp = { sendEmail: m => { st.mails.push(m); } };
  const UrlFetchApp = { fetch: (url, o) => { if (rede) throw new Error('sem rede'); st.fetches.push({ url, o, corpo: JSON.parse(o.payload) }); return { getResponseCode: () => status, getContentText: () => '{"x":1}' }; } };
  const PropertiesService = { getScriptProperties: () => ({ getProperty: k => st.props[k], setProperty: (k, v) => { st.props[k] = v; } }) };
  const Logger = { log: m => st.logs.push(String(m)) };
  const fonte = personalizar ? MODELO.replace('__EMAIL_DESTINO__', EMAIL).replace('__SEGREDO__', SEGREDO) : MODELO;
  const api = new Function('FormApp', 'SpreadsheetApp', 'ScriptApp', 'MailApp', 'UrlFetchApp', 'PropertiesService', 'Logger',
    fonte + '\nreturn { criarFormulario, aoEnviar, testarConexao, reenviarTodas, PERGUNTAS, CONFIG, NENHUMA, RE_CPF, RE_FONE, RE_PESO, RE_ALTURA };')(FormApp, SpreadsheetApp, ScriptApp, MailApp, UrlFetchApp, PropertiesService, Logger);
  return { st, api };
}

const respostaPadrao = (api, sobre = {}) => {
  const base = {};
  for (const q of api.PERGUNTAS.filter(q => q.titulo)) {
    if (q.tipo === 'texto') base[q.titulo] = q.email ? 'ana@exemplo.com' : q.padrao === api.RE_CPF ? '529.982.247-25' : q.padrao === api.RE_FONE ? '(16) 99294-3215' : q.padrao === api.RE_PESO ? '82,5' : q.padrao === api.RE_ALTURA ? '178' : 'Texto de teste';
    else if (q.tipo === 'paragrafo') base[q.titulo] = 'NENHUM';
    else if (q.tipo === 'data') base[q.titulo] = '1985-03-21';
    else if (q.parq) base[q.titulo] = 'Não';
    else if (q.tipo === 'lista' || q.tipo === 'escolha') base[q.titulo] = (q.valores ? q.valores[0][1] : [].concat(q.opcoes)[0]);
    else if (q.tipo === 'caixas') base[q.titulo] = [api.NENHUMA];
    else if (q.tipo === 'aceite') base[q.titulo] = [q.opcoes[0]];
  }
  const dados = { ...base, ...sobre };
  return { getId: () => 'RESP-1', getTimestamp: () => new Date('2026-11-24T15:00:00Z'), getItemResponses: () => Object.entries(dados).map(([t, v]) => ({ getItem: () => ({ getTitle: () => t }), getResponse: () => v })) };
};
const T = {
  nome: 'Nome completo', whats: 'WhatsApp (com DDD)', tel: 'Telefone (com DDD)', historico: 'O que você tem ou já teve?', meds: 'Medicamentos em uso (marque os que se aplicam)',
  sint: 'Você sente algum destes sintomas atualmente?', excl: 'Alguma destas situações se aplica a você?', atividade: 'Você realiza atividade física regularmente?', walk: 'Você consegue caminhar pelo menos 10 km sem parar por fadiga excessiva?',
};

test('O modelo do repositório não traz segredo nem e-mail real e se recusa a rodar sem configuração', () => {
  assert.ok(MODELO.includes('__SEGREDO__') && MODELO.includes('__EMAIL_DESTINO__'));
  assert.ok(!/hakunasconnect@|hakunasglobal|edson/i.test(MODELO), 'nenhum e-mail real no repositório público');
  const { api } = ambiente({ personalizar: false });
  assert.throws(() => api.criarFormulario(), /Preencha EMAIL_DESTINO e SEGREDO/);
});

test('Cria o formulário completo: itens, obrigatórias, planilha, gatilho e e-mail com os links; não duplica', () => {
  const { st, api } = ambiente(); api.criarFormulario();
  const perguntas = api.PERGUNTAS.filter(q => q.titulo), secoes = api.PERGUNTAS.filter(q => q.secao);
  assert.match(st.titulo, /TOP 1845/);
  assert.equal(st.items.filter(i => !/^add(PageBreak|SectionHeader)Item$/.test(i.tipo)).length, perguntas.length);
  assert.equal(st.items.filter(i => /^add(PageBreak|SectionHeader)Item$/.test(i.tipo)).length, secoes.length);
  const titulos = perguntas.map(q => q.titulo);
  assert.equal(new Set(titulos).size, titulos.length, 'títulos únicos (o script identifica a pergunta pelo título)');
  assert.ok(perguntas.length >= 55, 'ficha completa: ' + perguntas.length + ' perguntas');
  assert.ok(st.form.calls.setDestination, 'respostas também vão para uma planilha'); assert.deepEqual(st.triggers, ['aoEnviar']); assert.equal(st.props.FORM_ID, 'FORM123');
  const obrigatorias = st.items.filter(i => i.calls.setRequired?.[0]?.[0] === true).length;
  assert.equal(obrigatorias, perguntas.filter(q => q.obrigatoria).length);
  assert.equal(st.mails.length, 1); assert.equal(st.mails[0].to, EMAIL); assert.ok(st.mails[0].body.includes('https://forms.exemplo/responder'));
  api.criarFormulario(); assert.equal(st.items.length, perguntas.length + secoes.length, 'segunda execução não cria outro formulário'); assert.deepEqual(st.triggers, ['aoEnviar']);
});

test('Pede o que foi pedido: nome, endereço, e-mail, telefone e WhatsApp, mais o que a planilha e o manual usam', () => {
  const { api } = ambiente(); const t = api.PERGUNTAS.filter(q => q.titulo).map(q => q.titulo.toLowerCase());
  for (const trecho of ['nome completo', 'endereço', 'e-mail', 'telefone', 'whatsapp', 'cpf', 'data de nascimento', 'estado onde reside', 'cidade onde reside', 'profissão', 'peso', 'altura', 'tipo sanguíneo', 'plano de saúde', 'alergias', 'medicamentos', 'restrição alimentar', 'dieta especial', 'contato de emergência: nome', 'parente participa', 'atestado', 'par-q 7', 'vacina contra tétano', 'caminhar pelo menos 10 km', 'hábito de fumar', 'antecedentes familiares'])
    assert.ok(t.some(x => x.includes(trecho)), 'falta a pergunta: ' + trecho);
  const obrig = Object.fromEntries(api.PERGUNTAS.filter(q => q.titulo).map(q => [q.titulo, q.obrigatoria]));
  for (const k of ['Nome completo', 'CPF', 'E-mail', 'Telefone (com DDD)', 'WhatsApp (com DDD)', 'Endereço (rua, número, complemento e bairro)']) assert.equal(obrig[k], true, k + ' é obrigatório');
});

test('Contrato com o app: os critérios do formulário são exatamente os do app, cada um uma única vez', () => {
  const { api } = ambiente(); const ids = api.PERGUNTAS.filter(q => q.flags).flatMap(q => q.opcoes.map(o => o[0]));
  assert.equal(new Set(ids).size, ids.length, 'sem id repetido');
  assert.deepEqual([...ids].sort(), [...FLAG_IDS].sort(), 'se o protocolo do app mudar, este teste avisa que o formulário precisa mudar junto');
  const prep = Object.fromEntries(api.PERGUNTAS.filter(q => q.prep).map(q => [q.prep, q.valores.map(v => v[0])]));
  assert.deepEqual(prep, { activity: ['0', '1', '2', '3'], walk: ['0', '1', '2'], prior: ['0', '1'], tetanus: ['0', '1'] });
  assert.equal(api.PERGUNTAS.filter(q => q.parq).length, 7, 'PAR-Q de 7 itens');
});

test('As validações aceitam o que as pessoas digitam e recusam o que não serve', () => {
  const { api } = ambiente(); const ok = (re, v) => new RegExp(re).test(v);
  for (const v of ['529.982.247-25', '52998224725']) assert.ok(ok(api.RE_CPF, v), v); for (const v of ['abc', '1234', '529.982.247']) assert.ok(!ok(api.RE_CPF, v), v);
  for (const v of ['(16) 99294-3215', '16992943215', '+55 16 99294-3215']) assert.ok(ok(api.RE_FONE, v), v); for (const v of ['123', 'telefone']) assert.ok(!ok(api.RE_FONE, v), v);
  for (const v of ['82', '82,5', '82.5', '120']) assert.ok(ok(api.RE_PESO, v), v); for (const v of ['8', 'oitenta', '1234']) assert.ok(!ok(api.RE_PESO, v), v);
  for (const v of ['178', '1,78', '1.78', '165']) assert.ok(ok(api.RE_ALTURA, v), v); for (const v of ['17', 'alto', '17800']) assert.ok(!ok(api.RE_ALTURA, v), v);
});

test('Cadeia completa: resposta -> e-mail -> servidor -> normalização -> participante do app', () => {
  const { st, api } = ambiente(); api.criarFormulario();
  const resposta = respostaPadrao(api, {
    [T.nome]: 'Ana Souza', [T.whats]: '(16) 99294-3215', [T.tel]: '(16) 3333-4444',
    [T.historico]: ['Hipertensão (pressão alta)', 'Colesterol alto'], [T.meds]: ['Para pressão alta'], [T.sint]: [api.NENHUMA], [T.excl]: [api.NENHUMA],
    [T.atividade]: 'Sim, 1 a 2 vezes por semana', [T.walk]: 'Não tentei', 'PAR-Q 2: Você sente dor ou desconforto no peito quando faz atividades físicas?': 'Sim',
  });
  st.mails.length = 0; api.aoEnviar({ response: resposta });
  assert.equal(st.mails.length, 1, 'um e-mail da ficha'); const mail = st.mails[0];
  assert.equal(mail.to, EMAIL); assert.match(mail.subject, /Ana Souza/); assert.ok(mail.body.includes('Hipertensão (pressão alta)') && mail.body.includes('Critérios assinalados pelo participante: htn, chol, bpmed'));
  assert.ok(!mail.body.includes(SEGREDO) && !mail.subject.includes(SEGREDO), 'o segredo nunca vai no e-mail');
  assert.equal(st.fetches.length, 1); const f = st.fetches[0];
  assert.equal(f.url, 'https://triagemhakunas.vercel.app/api/intake'); assert.equal(f.o.headers['x-intake-secret'], SEGREDO);
  const p = f.corpo;
  assert.deepEqual(p.flags, ['htn', 'chol', 'bpmed']); assert.deepEqual(p.prep, { activity: '1', walk: '1', prior: '0', tetanus: '0' });
  assert.equal(p.fields.phone, '(16) 99294-3215', 'o WhatsApp vira o telefone da ficha'); assert.ok(p.extras.some(e => e.label === 'Telefone' && e.value === '(16) 3333-4444'));
  assert.equal(p.fields.emergency, 'Texto de teste - (16) 99294-3215 (Texto de teste)'); assert.equal(p.birthDate, '1985-03-21');
  assert.ok(p.fields.certificateText.includes('Sim, tenho e está dentro da validade')); assert.equal(p.fields.fitness, 'Sim, 1 a 2 vezes por semana');
  assert.match(p.fields.notes, /PAR-Q: resposta SIM nos itens 2\./);
  assert.ok(p.extras.some(e => e.label === 'Endereço'), 'endereço segue para a ficha'); assert.ok(p.answers.length >= 55, 'todas as respostas seguem para auditoria');
  // o servidor aceita exatamente isto, e o app transforma em participante
  const n = normalizeSubmission(p); assert.equal(n.name, 'Ana Souza'); assert.equal(n.record.fields.age, '41', 'idade calculada no servidor');
  const prev = submissionsToPreview([{ id: 'cccccccc-0000-0000-0000-000000000001', receivedAt: n.submittedAt, name: n.name, record: n.record }]);
  assert.equal(prev.rejected.length, 0, JSON.stringify(prev.rejected)); const part = prev.participants[0];
  assert.equal(part.name, 'Ana Souza'); assert.deepEqual(part.flags, ['htn', 'chol', 'bpmed']); assert.equal(part.activity, '1'); assert.equal(part.age, '41');
  assert.equal(part.weight, '82.5'); assert.equal(part.height, '178'); assert.equal(part.cpf.replace(/\D/g, ''), '52998224725'); assert.deepEqual(part.reviewed, []);
});

test('Se o app falhar (erro HTTP ou sem rede), a ficha continua chegando por e-mail e a coordenação é avisada', () => {
  for (const cenario of [{ status: 401 }, { status: 500 }, { rede: true }]) {
    const { st, api } = ambiente(cenario); api.criarFormulario(); st.mails.length = 0;
    assert.doesNotThrow(() => api.aoEnviar({ response: respostaPadrao(api, { [T.nome]: 'Bruno Lima' }) }));
    assert.equal(st.mails.length, 2, JSON.stringify(cenario)); assert.match(st.mails[0].subject, /Nova ficha de saúde — Bruno Lima/); assert.match(st.mails[1].subject, /ATENÇÃO.*NÃO chegou ao app/);
    assert.ok(!st.mails[1].body.includes(SEGREDO));
  }
});

test('reenviarTodas reenvia cada resposta existente; testarConexao envia só o teste', () => {
  const { st, api } = ambiente(); api.criarFormulario();
  st.responses = [respostaPadrao(api, { [T.nome]: 'Um Dois' }), respostaPadrao(api, { [T.nome]: 'Três Quatro' })];
  api.reenviarTodas(); assert.equal(st.fetches.length, 2); assert.ok(st.logs.some(l => /2 enviadas, 0 com falha/.test(l)));
  st.fetches.length = 0; api.testarConexao(); assert.deepEqual(st.fetches[0].corpo, { test: true }); assert.equal(st.fetches[0].o.headers['x-intake-secret'], SEGREDO);
});
