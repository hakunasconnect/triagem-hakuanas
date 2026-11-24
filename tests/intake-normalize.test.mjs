import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSubmission, FIELD_KEYS, FLAG_IDS } from '../src/intake/normalize.js';

const base = () => ({ responseId: 'R-123', submittedAt: '2026-11-24T12:00:00.000Z', top: '1845', fields: { name: '  Fulano   de Tal ', email: 'f@x.co' }, flags: [], prep: {}, extras: [], answers: [] });

test('Aceita o mínimo (id da resposta e nome) e limpa espaços', () => {
  const r = normalizeSubmission(base());
  assert.equal(r.responseId, 'R-123'); assert.equal(r.top, '1845'); assert.equal(r.name, 'Fulano de Tal');
  assert.equal(r.record.fields.name, 'Fulano de Tal'); assert.equal(r.record.fields.email, 'f@x.co');
  assert.deepEqual(r.record.flags, []);
});

test('Exige o id da resposta e o nome', () => {
  assert.throws(() => normalizeSubmission({ ...base(), responseId: '' }), /id da resposta/i);
  assert.throws(() => normalizeSubmission({ ...base(), fields: { name: ' ' } }), /nome/i);
  assert.throws(() => normalizeSubmission(null), /inválid/i);
  assert.throws(() => normalizeSubmission('texto'), /inválid/i);
});

test('Só entram campos e critérios que o app conhece; o resto é descartado', () => {
  const r = normalizeSubmission({ ...base(), fields: { name: 'Ana', password: 'x', __proto__x: 1, cpf: '123.456.789-09', weight: '80' }, flags: ['htn', 'invente', 'htn', 'surgery'] });
  assert.deepEqual(Object.keys(r.record.fields).sort(), ['cpf', 'name', 'weight']);
  assert.deepEqual(r.record.flags, ['htn', 'surgery'], 'sem repetidos e sem ids inventados');
  assert.ok(FIELD_KEYS.includes('cpf') && FLAG_IDS.includes('htn') && FLAG_IDS.length >= 30);
});

test('Preparação: só valores válidos das 4 perguntas', () => {
  const r = normalizeSubmission({ ...base(), prep: { activity: '2', walk: '9', tetanus: '1', prior: 'x', outra: '1' } });
  assert.deepEqual(r.record.prep, { activity: '2', tetanus: '1' });
});

test('Idade é calculada da data de nascimento na data do envio, sem sobrescrever a informada', () => {
  assert.equal(normalizeSubmission({ ...base(), birthDate: '1985-11-25' }).record.fields.age, '40', 'ainda não fez 41');
  assert.equal(normalizeSubmission({ ...base(), birthDate: '1985-11-24' }).record.fields.age, '41', 'faz 41 no próprio dia');
  assert.equal(normalizeSubmission({ ...base(), birthDate: '2009-06-01' }).record.fields.age, '17');
  assert.equal(normalizeSubmission({ ...base(), fields: { name: 'Ana', age: '50' }, birthDate: '1985-01-01' }).record.fields.age, '50');
  assert.equal(normalizeSubmission({ ...base(), birthDate: 'lixo' }).record.fields.age, undefined);
});

test('Limita tamanhos: campos, extras e respostas', () => {
  const r = normalizeSubmission({ ...base(), fields: { name: 'A'.repeat(500), notes: 'n'.repeat(9000) }, extras: Array.from({ length: 200 }, (_, i) => ({ label: 'L' + i, value: 'v'.repeat(5000) })), answers: Array.from({ length: 400 }, (_, i) => ({ q: 'P' + i, v: ['a', 'b'] })) });
  assert.ok(r.record.fields.name.length <= 200); assert.ok(r.record.fields.notes.length <= 4000);
  assert.ok(r.record.extras.length <= 80); assert.ok(r.record.extras.every(e => e.value.length <= 1000));
  assert.ok(r.answers.length <= 150); assert.equal(r.answers[0].v, 'a; b', 'lista vira texto');
});

test('Datas inválidas viram a data atual; extras sem rótulo ou valor são ignorados', () => {
  const r = normalizeSubmission({ ...base(), submittedAt: 'ontem', extras: [{ label: 'Endereço', value: 'Rua A, 10' }, { label: '', value: 'x' }, { label: 'Vazio', value: '  ' }, 'lixo'] }, { now: new Date('2026-11-24T10:00:00Z') });
  assert.equal(r.submittedAt, '2026-11-24T10:00:00.000Z');
  assert.deepEqual(r.record.extras, [{ label: 'Endereço', value: 'Rua A, 10' }]);
});

test('Campos de várias linhas mantêm a quebra de linha; os de uma linha não', () => {
  const r = normalizeSubmission({ ...base(), fields: { name: 'Ana\nSilva', notes: 'linha 1\nlinha 2', medication: 'A\n\n\nB' } });
  assert.equal(r.record.fields.name, 'Ana Silva'); assert.equal(r.record.fields.notes, 'linha 1\nlinha 2'); assert.equal(r.record.fields.medication, 'A\n\nB');
});
