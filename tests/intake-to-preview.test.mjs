import { test } from 'node:test';
import assert from 'node:assert/strict';
import { submissionsToPreview, findExisting } from '../src/intake/to-preview.js';

const item = (over = {}, fields = {}) => ({
  id: 'aaaaaaaa-0000-0000-0000-000000000001', receivedAt: '2026-11-24T15:00:00Z', name: 'Ana Souza', status: 'novo',
  record: {
    fields: { name: 'Ana Souza', cpf: '529.982.247-25', email: 'a@x.co', phone: '(16) 99294-3215', age: '38', state: 'SP', weight: '82,5', height: '178', blood: 'O+', medication: 'Losartana 50 mg', emergency: 'Maria - 16999990000 (esposa)', ...fields },
    extras: [{ label: 'Endereço', value: 'Rua das Flores, 10 - Centro' }, { label: 'Cidade', value: 'Ribeirão Preto' }],
    flags: ['htn', 'bpmed'], prep: { activity: '1', walk: '0', tetanus: '1', prior: '0' },
  }, ...over,
});

test('Inscrição vira participante pelo mesmo importador das planilhas, com critérios e preparação', () => {
  const r = submissionsToPreview([item()]);
  assert.equal(r.rejected.length, 0); assert.equal(r.participants.length, 1);
  const p = r.participants[0];
  assert.equal(p.name, 'Ana Souza'); assert.equal(p.email, 'a@x.co'); assert.equal(p.state, 'SP'); assert.equal(p.age, '38'); assert.equal(p.blood, 'O+');
  assert.equal(p.weight, '82.5'); assert.equal(p.height, '178');
  assert.ok(p.cpf.replace(/\D/g, '') === '52998224725');
  assert.deepEqual(p.flags, ['htn', 'bpmed']);
  assert.deepEqual([p.activity, p.walk, p.tetanus, p.prior], ['1', '0', '1', '0']);
  assert.deepEqual(p.reviewed, [], 'nenhuma seção nasce como revisada com o participante');
  assert.equal(p.importReviewed, false);
  assert.ok(p.sourceFields.some(f => f.label === 'Endereço' && f.value.includes('Rua das Flores')), 'endereço aparece nos dados de origem');
  assert.ok(p.sourceFields.every(f => /Formulário Google/.test(f.location)), 'toda informação indica a origem');
  assert.ok(p.importWarnings.some(w => /autodeclarad/i.test(w)), 'aviso de que é autodeclarado');
  assert.equal(p.formSubmissionId, 'aaaaaaaa-0000-0000-0000-000000000001');
  assert.ok(r.warnings.some(w => /autodeclarad/i.test(w)));
});

test('Várias inscrições mantêm a ordem e os ids alinhados com os participantes', () => {
  const r = submissionsToPreview([item(), item({ id: 'aaaaaaaa-0000-0000-0000-000000000002', name: 'Bruno' }, { name: 'Bruno Lima', cpf: '', email: 'b@x.co' })]);
  assert.deepEqual(r.participants.map(p => p.name), ['Ana Souza', 'Bruno Lima']);
  assert.deepEqual(r.ids, ['aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002']);
  assert.notEqual(r.participants[0].id, r.participants[1].id);
});

test('Uma ficha inválida é rejeitada sozinha, com o motivo, e as outras seguem', () => {
  const r = submissionsToPreview([item({ id: 'aaaaaaaa-0000-0000-0000-00000000000f', name: 'Jovem Demais' }, { name: 'Jovem Demais', age: '15' }), item()]);
  assert.equal(r.participants.length, 1); assert.equal(r.participants[0].name, 'Ana Souza');
  assert.equal(r.rejected.length, 1); assert.equal(r.rejected[0].name, 'Jovem Demais'); assert.match(r.rejected[0].error, /^Idade deve ser inteira entre 16 e 120 anos\.$/, 'só o motivo, sem o prefixo técnico de origem');
  assert.equal(r.rejected[0].id, 'aaaaaaaa-0000-0000-0000-00000000000f');
});

test('O que não foi preenchido não é inventado: só nome também entra, sem critérios', () => {
  const r = submissionsToPreview([{ id: 'bbbbbbbb-0000-0000-0000-000000000001', receivedAt: '2026-11-24T15:00:00Z', name: 'Só Nome', record: { fields: { name: 'Só Nome' }, extras: [], flags: [], prep: {} } }]);
  const p = r.participants[0];
  assert.equal(p.name, 'Só Nome'); assert.deepEqual(p.flags, []); assert.equal(p.activity, undefined); assert.ok(!p.cpf, 'sem CPF informado, o campo fica vazio (o app mostra "não preenchido")');
});

test('findExisting reconhece quem já está na lista por CPF, e-mail ou nome+telefone', () => {
  const lista = [{ name: 'Ana  SOUZA', cpf: '52998224725', email: '', phone: '16992943215' }, { name: 'Outro', cpf: '', email: 'o@x.co', phone: '' }];
  assert.equal(findExisting(item().record, lista)?.name, 'Ana  SOUZA', 'por CPF (com ou sem máscara)');
  assert.equal(findExisting({ fields: { name: 'Fulano', email: 'O@X.CO' } }, lista)?.name, 'Outro', 'por e-mail sem diferenciar maiúsculas');
  assert.equal(findExisting({ fields: { name: 'ana souza', phone: '(16) 99294-3215' } }, lista)?.name, 'Ana  SOUZA', 'por nome e telefone');
  assert.equal(findExisting({ fields: { name: 'Ana Souza', phone: '11 98888-7777' } }, lista), null, 'mesmo nome com telefone diferente não é o mesmo');
  assert.equal(findExisting({ fields: { name: 'Pessoa Nova', cpf: '11144477735' } }, lista), null);
});
