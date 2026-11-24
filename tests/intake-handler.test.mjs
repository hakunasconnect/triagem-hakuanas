import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleIntake } from '../src/intake/handler.js';

const J = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
const SECRET = 'segredo-de-teste-123';
const UID = { master: '00000000-0000-0000-0000-00000000000a', tri: '00000000-0000-0000-0000-00000000000b' };
const ROWS = [{ id: '10000000-0000-0000-0000-000000000001', received_at: '2026-11-24T12:00:00Z', top: '1845', participant_name: 'Ana', status: 'novo', record: { fields: { name: 'Ana' }, flags: [], prep: {}, extras: [] } }];
function world({ duplicate = false, profiles = { 'tok-master': { id: UID.master, role: 'admin_master' }, 'tok-tri': { id: UID.tri, role: 'triador' } } } = {}) {
  const log = [];
  const fetch = async (u, i = {}) => {
    const url = String(u), m = i.method || 'GET'; log.push({ url, m, headers: i.headers || {}, body: i.body ? JSON.parse(i.body) : undefined });
    if (url.includes('/auth/v1/user')) { const t = (i.headers.Authorization || '').replace('Bearer ', ''); return profiles[t] ? J(200, { id: profiles[t].id }) : J(401, {}); }
    if (url.includes('/rest/v1/profiles')) { const id = /eq\.([^&]+)/.exec(url)?.[1]; const p = Object.values(profiles).find(x => x.id === id); return J(200, p ? [p] : []); }
    if (url.includes('/rest/v1/form_submissions') && m === 'POST') return J(201, duplicate ? [] : [{ id: 'novo-id' }]);
    if (url.includes('/rest/v1/form_submissions') && m === 'GET') return J(200, ROWS);
    if (url.includes('/rest/v1/form_submissions') && m === 'PATCH') return J(200, [{ id: 'a' }, { id: 'b' }]);
    throw new Error('rota inesperada ' + m + ' ' + url);
  };
  return { log, deps: { fetch, supabaseUrl: 'https://x.supabase.co', anonKey: 'ANON', serviceKey: 'SERVICE', intakeSecret: SECRET } };
}
const hook = (body, ...rest) => ({ method: 'POST', secret: rest.length ? rest[0] : SECRET, body }); // hook(b, undefined) = sem segredo
const app = (body, tok = 'tok-tri') => ({ method: 'POST', authorization: 'Bearer ' + tok, body });
const writes = w => w.log.filter(c => c.m !== 'GET' && !c.url.includes('/auth/v1'));
const payload = () => ({ responseId: 'R-1', fields: { name: 'Ana Souza', email: 'a@x.co' }, flags: ['htn'], prep: { activity: '1' }, extras: [{ label: 'Endereço', value: 'Rua A' }], answers: [{ q: 'Nome', v: 'Ana Souza' }] });

test('Recebimento do formulário: segredo errado, ausente ou não configurado nunca grava', async () => {
  for (const secret of ['errado', '', undefined]) { const w = world(); const r = await handleIntake(hook(payload(), secret), w.deps); assert.equal(r.status, 401, String(secret)); assert.equal(writes(w).length, 0); }
  const w = world(); w.deps.intakeSecret = ''; const r = await handleIntake(hook(payload()), w.deps); assert.equal(r.status, 503); assert.equal(writes(w).length, 0);
});

test('Recebimento válido grava normalizado, ignora repetição e não mexe no que já foi importado', async () => {
  const w = world(); const r = await handleIntake(hook(payload()), w.deps);
  assert.equal(r.status, 200); assert.equal(r.json.saved, true);
  const post = writes(w)[0];
  assert.ok(post.url.includes('on_conflict=response_id')); assert.ok(post.headers.Prefer.includes('ignore-duplicates'), 'repetição não sobrescreve');
  assert.equal(post.headers.Authorization, 'Bearer SERVICE');
  assert.equal(post.body.response_id, 'R-1'); assert.equal(post.body.participant_name, 'Ana Souza');
  assert.deepEqual(post.body.record.flags, ['htn']); assert.equal(post.body.status, undefined, 'status nasce pelo padrão do banco');
  const d = world({ duplicate: true }); const r2 = await handleIntake(hook(payload()), d.deps);
  assert.equal(r2.status, 200); assert.equal(r2.json.saved, false); assert.equal(r2.json.duplicate, true);
});

test('Teste de conexão (test:true) confirma o segredo sem gravar nada', async () => {
  const w = world(); const r = await handleIntake(hook({ test: true }), w.deps);
  assert.equal(r.status, 200); assert.equal(r.json.test, true); assert.equal(writes(w).length, 0);
});

test('Carga inválida volta 400 com motivo e não grava', async () => {
  const w = world(); const r = await handleIntake(hook({ responseId: 'x', fields: { name: '' } }), w.deps);
  assert.equal(r.status, 400); assert.match(r.json.error, /nome/i); assert.equal(writes(w).length, 0);
  assert.equal((await handleIntake({ method: 'GET', secret: SECRET, body: {} }, world().deps)).status, 405);
});

test('App: lista as inscrições novas para quem está logado (qualquer papel de equipe)', async () => {
  for (const tok of ['tok-tri', 'tok-master']) { const w = world(); const r = await handleIntake(app({ action: 'list' }, tok), w.deps); assert.equal(r.status, 200); assert.equal(r.json.items.length, 1); assert.equal(r.json.items[0].record.fields.name, 'Ana'); assert.ok(w.log.find(c => c.url.includes('form_submissions')).url.includes('status=eq.novo')); }
  const w = world(); await handleIntake(app({ action: 'list', includeImported: true }), w.deps);
  assert.ok(!w.log.find(c => c.url.includes('form_submissions')).url.includes('status=eq.novo'), 'incluir já importadas tira o filtro');
});

test('App: sem sessão válida ou sem perfil, nada é lido', async () => {
  const w = world(); assert.equal((await handleIntake(app({ action: 'list' }, 'tok-falso'), w.deps)).status, 401);
  assert.equal((await handleIntake({ method: 'POST', body: { action: 'list' } }, w.deps)).status, 401);
  const w2 = world({ profiles: { 'tok-x': { id: 'u-sem-perfil-role', role: undefined } } }); w2.log.length = 0;
  assert.ok([401, 403].includes((await handleIntake(app({ action: 'list' }, 'tok-x'), w2.deps)).status));
  assert.ok(!w.log.some(c => c.url.includes('form_submissions')));
});

test('App: marcar como importada só aceita ids válidos e registra quem importou', async () => {
  const w = world(); const ids = ['10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002'];
  const r = await handleIntake(app({ action: 'mark', ids }, 'tok-tri'), w.deps);
  assert.equal(r.status, 200); assert.equal(r.json.marked, 2);
  const patch = writes(w)[0]; assert.equal(patch.body.status, 'importado'); assert.equal(patch.body.imported_by, UID.tri); assert.ok(patch.body.imported_at);
  assert.ok(patch.url.includes(ids[0]) && patch.url.includes(ids[1]));
  const bad = world(); assert.equal((await handleIntake(app({ action: 'mark', ids: ['1; drop table'] }), bad.deps)).status, 400); assert.equal(writes(bad).length, 0);
  assert.equal((await handleIntake(app({ action: 'mark', ids: [] }), world().deps)).status, 400);
  assert.equal((await handleIntake(app({ action: 'apagar' }), world().deps)).status, 400);
});
