import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleIntake } from '../src/intake/handler.js';
import { normalizeSubmission } from '../src/intake/normalize.js';
import { createWorld, USERS, FORM_TEMPLATE } from './helpers/fake-intake-world.mjs';

// Contrato (pedido do responsável, 25/11/2026): cada ficha do formulário tem de ser atribuída COM EXATIDÃO ao triador e à pista de origem.
// Várias pistas, vários triadores ao mesmo tempo: na dúvida a ficha NÃO é atribuída a ninguém (vai para "sem identificação"), nunca ao triador errado.
const SECRET = 'segredo-de-teste-123', CODE = /^[A-HJKMNP-Z2-9]{10}$/;
const app = (body, u) => ({ method: 'POST', authorization: 'Bearer ' + u.token, body });
const hook = (body, secret = SECRET) => ({ method: 'POST', secret, body });
const ficha = (nome, extra = {}) => ({ responseId: 'R-' + nome, fields: { name: nome + ' Silva', email: nome.toLowerCase() + '@exemplo.com' }, flags: [], prep: {}, extras: [], answers: [], ...extra });
async function preparar() {
  const w = createWorld(), call = (b, u) => handleIntake(app(b, u), w.deps);
  const p1 = (await call({ action: 'pista_save', name: 'Pista 1', place: 'Vitória/ES', top: '1827' }, USERS.admin)).json.pista;
  const p2 = (await call({ action: 'pista_save', name: 'Pista 2', place: 'Vitória/ES', top: '1827' }, USERS.admin)).json.pista;
  const c1 = (await call({ action: 'pista_claim', pistaId: p1.id }, USERS.tri1)).json, c2 = (await call({ action: 'pista_claim', pistaId: p2.id }, USERS.tri2)).json;
  return { w, call, p1, p2, c1, c2 };
}
const enviar = (w, f) => handleIntake(hook(f), w.deps);
const linhaDe = (w, nome) => w.db.form_submissions.find(r => r.response_id === 'R-' + nome);

test('normalização: o código da pista vira MAIÚSCULAS sem espaço nem hífen, e some se vier vazio', () => {
  assert.equal(normalizeSubmission({ responseId: 'r', fields: { name: 'Ana Souza' }, pistaCode: ' k7m2-q9x4 tz ' }).pistaCode, 'K7M2Q9X4TZ');
  assert.equal(normalizeSubmission({ responseId: 'r', fields: { name: 'Ana Souza' } }).pistaCode, '');
  assert.equal(normalizeSubmission({ responseId: 'r', fields: { name: 'Ana Souza' }, pistaCode: 'x'.repeat(500) }).pistaCode.length <= 40, true);
});

test('cadastro de pistas: só admin master e admin com permissão; triador, coordenador e admin sem a permissão são recusados sem gravar nada', async () => {
  const w = createWorld(), call = (b, u) => handleIntake(app(b, u), w.deps), nova = { action: 'pista_save', name: 'Pista 1', place: 'Serra/ES', top: '1827' };
  for (const u of [USERS.tri1, USERS.coord, USERS.adminSemGestao]) { const r = await call(nova, u); assert.equal(r.status, 403, u.role); }
  assert.equal(w.gravacoes().length, 0, 'recusado não grava');
  const ok = await call(nova, USERS.admin); assert.equal(ok.status, 200); assert.equal(ok.json.pista.name, 'Pista 1'); assert.equal(ok.json.pista.active, true);
  assert.equal((await call({ ...nova, name: 'Pista 9' }, USERS.master)).status, 200);
  assert.equal((await call(nova, USERS.master)).status, 409, 'nome+local+TOP repetidos não duplicam');
  assert.equal((await call({ ...nova, name: '   ' }, USERS.admin)).status, 400, 'nome vazio');
  assert.equal((await call({ ...nova, name: 'x'.repeat(61) }, USERS.admin)).status, 400, 'nome longo demais');
  const off = await call({ action: 'pista_save', id: ok.json.pista.id, name: 'Pista 1', place: 'Serra/ES', top: '1827', active: false }, USERS.admin);
  assert.equal(off.status, 200); assert.equal(w.db.pistas.find(p => p.id === ok.json.pista.id).active, false);
});

test('cada triador recebe um código único e estável por pista; o link do formulário leva o código', async () => {
  const { w, call, p1, c1, c2 } = await preparar();
  assert.match(c1.code, CODE); assert.match(c2.code, CODE); assert.notEqual(c1.code, c2.code);
  assert.equal(c1.link, FORM_TEMPLATE.replace('__CODIGO__', c1.code)); assert.equal(c1.linkConfigured, true);
  assert.equal((await call({ action: 'pista_claim', pistaId: p1.id }, USERS.tri1)).json.code, c1.code, 'pedir de novo devolve o MESMO código (não cria outro)');
  assert.equal(w.db.pista_links.filter(l => l.triager_id === USERS.tri1.id).length, 1);
  const outro = (await call({ action: 'pista_claim', pistaId: p1.id }, USERS.tri3)).json; assert.match(outro.code, CODE); assert.notEqual(outro.code, c1.code, 'dois triadores na mesma pista têm códigos diferentes');
  assert.equal(c1.pista.name, 'Pista 1'); assert.equal(c1.triager.name, 'Triador Um');
  for (const tpl of [undefined, '', 'https://docs.google.com/forms/d/e/X/viewform', 'https://exemplo.com/?c=__CODIGO__']) { const w2 = createWorld({ linkTemplate: tpl }); const q = (await handleIntake(app({ action: 'pista_save', name: 'P', place: '', top: '' }, USERS.admin), w2.deps)).json.pista; const r = (await handleIntake(app({ action: 'pista_claim', pistaId: q.id }, USERS.tri1), w2.deps)).json; assert.equal(r.link, null, String(tpl)); assert.equal(r.linkConfigured, false); assert.match(r.code, CODE); }
  assert.equal((await call({ action: 'pista_claim', pistaId: 'nao-e-uuid' }, USERS.tri1)).status, 400);
  assert.equal((await call({ action: 'pista_claim', pistaId: '11111111-1111-1111-1111-111111111111' }, USERS.tri1)).status, 404);
  await call({ action: 'pista_save', id: p1.id, name: 'Pista 1', place: 'Vitória/ES', top: '1827', active: false }, USERS.admin);
  assert.equal((await call({ action: 'pista_claim', pistaId: p1.id }, USERS.tri3)).status, 400, 'pista desativada não gera código novo');
});

test('ficha com código válido é atribuída ao triador e à pista certos; sem código, desconhecido ou lixo NUNCA é atribuída', async () => {
  const { w, c1, c2 } = await preparar(), idDe = c => w.db.pista_links.find(l => l.code === c).id;
  const resultados = await Promise.all([ // vários envios ao mesmo tempo, de pistas diferentes
    enviar(w, ficha('Ana', { pistaCode: c1.code })),
    enviar(w, ficha('Beto', { pistaCode: ' ' + c2.code.slice(0, 5).toLowerCase() + '-' + c2.code.slice(5) + ' ' })),
    enviar(w, ficha('Caio')),
    enviar(w, ficha('Davi', { pistaCode: 'ZZZZZZZZZZ' })),
    enviar(w, ficha('Eli', { pistaCode: 'abc' })),
    enviar(w, ficha('Fabio', { pistaCode: c1.code })),
  ]);
  assert.ok(resultados.every(r => r.status === 200 && r.json.saved === true));
  assert.equal(linhaDe(w, 'Ana').pista_link_id, idDe(c1.code)); assert.equal(linhaDe(w, 'Ana').pista_code, c1.code);
  assert.equal(linhaDe(w, 'Fabio').pista_link_id, idDe(c1.code));
  assert.equal(linhaDe(w, 'Beto').pista_link_id, idDe(c2.code), 'maiúsculas/espaço/hífen não impedem a conferência');
  assert.equal(linhaDe(w, 'Caio').pista_link_id ?? null, null); assert.equal(linhaDe(w, 'Caio').pista_code ?? '', '');
  assert.equal(linhaDe(w, 'Davi').pista_link_id ?? null, null, 'código com formato válido mas inexistente'); assert.equal(linhaDe(w, 'Davi').pista_code, 'ZZZZZZZZZZ', 'guarda o código recebido para auditoria');
  assert.equal(linhaDe(w, 'Eli').pista_link_id ?? null, null); assert.equal(linhaDe(w, 'Eli').pista_code, 'ABC');
});

test('se a conferência do código falhar, a ficha NÃO é gravada sem atribuição: o envio falha e pode ser repetido', async () => {
  const { w, c1 } = await preparar(), antes = w.db.form_submissions.length;
  w.falharProxima('pista_links', 'GET');
  const r = await enviar(w, ficha('Gil', { pistaCode: c1.code }));
  assert.equal(r.status, 500); assert.equal(w.db.form_submissions.length, antes, 'nada gravado quando não deu para conferir');
  const outra = await enviar(w, ficha('Gil', { pistaCode: c1.code })); // o reenvio do script (reenviarTodas) funciona
  assert.equal(outra.status, 200); assert.equal(linhaDe(w, 'Gil').pista_link_id, w.db.pista_links.find(l => l.code === c1.code).id);
});

async function comFichas() {
  const ctx = await preparar(), { w, c1, c2 } = ctx;
  for (const [n, code] of [['Ana', c1.code], ['Beto', c2.code], ['Caio', ''], ['Davi', 'ZZZZZZZZZZ']]) await enviar(w, ficha(n, { pistaCode: code }));
  return ctx;
}
const nomes = r => r.json.items.map(i => i.name.split(' ')[0]).sort();

test('visibilidade: cada triador vê só as fichas da PRÓPRIA pista; coordenador, admin e master veem todas; triador sem pista não vê nada', async () => {
  const { call, c1, c2 } = await comFichas();
  const t1 = await call({ action: 'list' }, USERS.tri1), t2 = await call({ action: 'list' }, USERS.tri2), t3 = await call({ action: 'list' }, USERS.tri3);
  assert.deepEqual(nomes(t1), ['Ana']); assert.deepEqual(nomes(t2), ['Beto']); assert.deepEqual(nomes(t3), [], 'sem pista não enxerga nenhuma (nunca "todas")');
  assert.ok(!JSON.stringify(t1.json).includes(c2.code) && !JSON.stringify(t2.json).includes(c1.code), 'o código da outra pista não vaza');
  for (const u of [USERS.coord, USERS.admin, USERS.master]) { const r = await call({ action: 'list' }, u); assert.deepEqual(nomes(r), ['Ana', 'Beto', 'Caio', 'Davi'], u.role); }
  const todos = (await call({ action: 'list' }, USERS.coord)).json.items, por = n => todos.find(i => i.name.startsWith(n));
  assert.equal(por('Ana').pista.name, 'Pista 1'); assert.equal(por('Ana').pista.place, 'Vitória/ES'); assert.equal(por('Ana').pista.top, '1827'); assert.equal(por('Ana').pista.triager, 'Triador Um');
  assert.equal(por('Beto').pista.triager, 'Triador Dois');
  assert.equal(por('Caio').pista, null); assert.equal(por('Davi').pista, null); assert.equal(por('Davi').pistaCode, 'ZZZZZZZZZZ');
});

test('importar (mark): o triador só marca fichas da própria pista; as de outra pista e as sem identificação ficam intactas', async () => {
  const { w, call } = await comFichas(), id = n => linhaDe(w, n).id, status = n => linhaDe(w, n).status;
  const fora = await call({ action: 'mark', ids: [id('Beto'), id('Caio'), id('Davi')] }, USERS.tri1);
  assert.equal(fora.json.marked, 0); assert.deepEqual(['Beto', 'Caio', 'Davi'].map(status), ['novo', 'novo', 'novo']);
  const dele = await call({ action: 'mark', ids: [id('Ana'), id('Beto')] }, USERS.tri1);
  assert.equal(dele.json.marked, 1); assert.equal(status('Ana'), 'importado'); assert.equal(status('Beto'), 'novo');
  assert.equal((await call({ action: 'mark', ids: [id('Caio')] }, USERS.coord)).json.marked, 1, 'coordenador decide as sem identificação');
  assert.equal(status('Caio'), 'importado');
});

test('lista de pistas: o triador vê as pistas e só os próprios códigos', async () => {
  const { call, p1, c1, c2 } = await comFichas();
  const r = await call({ action: 'pista_list' }, USERS.tri1);
  assert.equal(r.status, 200); assert.equal(r.json.pistas.length, 2);
  assert.deepEqual(r.json.mine.map(m => m.pistaId), [p1.id]); assert.equal(r.json.mine[0].code, c1.code);
  assert.ok(!JSON.stringify(r.json).includes(c2.code));
  assert.equal((await handleIntake({ method: 'POST', authorization: 'Bearer tok-invalido', body: { action: 'pista_list' } }, createWorld().deps)).status, 401);
});

test('dois pedidos de código ao mesmo tempo (toque duplo) terminam com o MESMO código e um único vínculo', async () => {
  const { w, call, p1 } = await preparar(), antes = w.db.pista_links.length;
  const [a, b, c] = await Promise.all([call({ action: 'pista_claim', pistaId: p1.id }, USERS.tri3), call({ action: 'pista_claim', pistaId: p1.id }, USERS.tri3), call({ action: 'pista_claim', pistaId: p1.id }, USERS.tri3)]);
  assert.deepEqual([a.status, b.status, c.status], [200, 200, 200]);
  assert.equal(a.json.code, b.json.code); assert.equal(b.json.code, c.json.code);
  assert.equal(w.db.pista_links.length, antes + 1, 'só um vínculo novo foi criado');
});
