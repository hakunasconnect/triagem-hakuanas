import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTelemetry } from '../src/telemetry.js';

function mundo({ intake = () => ({ items: [] }), rede = true } = {}) {
  const calls = [];
  const fetch = async (u, i = {}) => {
    const url = String(u); calls.push({ url, i, body: i.body ? JSON.parse(i.body) : undefined });
    const res = body => ({ ok: true, json: async () => body, text: async () => JSON.stringify(body) });
    if (url.includes('/auth/v1/token')) return res({ access_token: 'tok', user: { id: 'u1', email: 't@x.co' } });
    if (url.includes('/rest/v1/profiles')) return res([{ full_name: 'Triador', legend_number: '1' }]);
    if (url.includes('/rest/v1/usage_sessions')) return res([{ id: 's1' }]);
    if (url.includes('/rest/v1/usage_events')) return res([]);
    if (url.endsWith('/api/intake')) { if (!rede) throw new Error('sem rede'); return res(intake(JSON.parse(i.body))); }
    throw new Error('rota inesperada ' + url);
  };
  return { calls, fetch };
}
const cliente = (w, extra = {}) => createTelemetry({ url: 'https://x.supabase.co', anonKey: 'ANON', fetch: w.fetch, appVersion: 't', ...extra });

test('Sem login, buscar inscrições não faz nenhuma chamada e explica o que falta', async () => {
  const w = mundo(); const r = await cliente(w).intake('list');
  assert.match(r.error, /Entre na conta do triador/); assert.equal(w.calls.length, 0);
});

test('Com login, envia o token do triador e a ação ao /api/intake do site', async () => {
  const w = mundo({ intake: b => ({ items: [], visto: b }) }); const t = cliente(w); await t.signIn('t@x.co', 'Senha-Falsa-123!');
  const r = await t.intake('list', { includeImported: true });
  const c = w.calls.find(x => x.url.endsWith('/api/intake'));
  assert.equal(c.url, 'https://triagemhakunas.vercel.app/api/intake'); assert.equal(c.i.method, 'POST'); assert.equal(c.i.headers.Authorization, 'Bearer tok');
  assert.deepEqual(c.body, { action: 'list', includeImported: true }); assert.deepEqual(r.visto, { action: 'list', includeImported: true });
  await t.intake('mark', { ids: ['a'] }); assert.deepEqual(w.calls.filter(x => x.url.endsWith('/api/intake')).at(-1).body, { action: 'mark', ids: ['a'] });
});

test('O endereço do /api/intake acompanha o do /api/alert configurado', async () => {
  const w = mundo(); const t = cliente(w, { alertUrl: 'https://outro.exemplo/api/alert' }); await t.signIn('t@x.co', 'Senha-Falsa-123!'); await t.intake('list');
  assert.ok(w.calls.some(x => x.url === 'https://outro.exemplo/api/intake'));
});

test('Falha de rede vira mensagem, sem estourar erro', async () => {
  const w = mundo({ rede: false }); const t = cliente(w); await t.signIn('t@x.co', 'Senha-Falsa-123!');
  assert.deepEqual(await t.intake('list'), { error: 'Sem conexão com o servidor.' });
});
