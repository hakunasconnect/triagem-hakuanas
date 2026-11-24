// Endpoint /api/intake (testável, sem depender da Vercel). Dois usos, separados pelo cabeçalho:
//  1) o formulário Google envia a inscrição com o segredo (x-intake-secret) -> grava no banco com a chave de serviço;
//  2) o app, com o login do triador (Bearer), lista as inscrições novas e marca as importadas.
import { createHash, timingSafeEqual } from 'node:crypto';
import { normalizeSubmission } from './normalize.js';

const out = (status, json) => ({ status, json });
const sha = s => createHash('sha256').update(String(s ?? '')).digest();
const sameSecret = (a, b) => timingSafeEqual(sha(a), sha(b));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEAM = ['admin_master', 'admin', 'coordenador', 'triador'];
const MAX_BODY = 120000;

export async function handleIntake({ method, secret, authorization, body } = {}, { fetch: f, supabaseUrl, anonKey, serviceKey, intakeSecret } = {}) {
  if (method !== 'POST') return out(405, { error: 'Método não permitido.' });
  if (!body || typeof body !== 'object') return out(400, { error: 'Pedido inválido.' });
  if (JSON.stringify(body).length > MAX_BODY) return out(413, { error: 'Pedido grande demais.' });

  const svc = { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' };
  const sb = async (path, init = {}) => {
    const r = await f(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers: { ...svc, Prefer: 'return=representation', ...(init.headers || {}) } });
    if (!r.ok) throw Error('banco ' + r.status);
    const t = await r.text(); return t ? JSON.parse(t) : null;
  };

  // 1) Formulário Google -> servidor
  if (secret !== undefined || !authorization) {
    if (!intakeSecret) return out(503, { error: 'Recebimento de inscrições não configurado no servidor.' });
    if (!secret || !sameSecret(secret, intakeSecret)) return out(401, { error: 'Não autorizado.' });
    if (body.test === true) return out(200, { ok: true, test: true });
    let s;
    try { s = normalizeSubmission(body); } catch (e) { return out(400, { error: e.message }); }
    try {
      const rows = await sb('form_submissions?on_conflict=response_id', {
        method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify({ response_id: s.responseId, top: s.top, received_at: s.submittedAt, participant_name: s.name, record: s.record, answers: s.answers }),
      });
      return Array.isArray(rows) && rows.length ? out(200, { saved: true }) : out(200, { saved: false, duplicate: true });
    } catch { return out(500, { error: 'Não foi possível gravar a inscrição.' }); }
  }

  // 2) App -> servidor (login do triador)
  const token = /^Bearer (.+)$/.exec(authorization || '')?.[1];
  if (!token) return out(401, { error: 'Entre com sua conta.' });
  const who = await f(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: 'Bearer ' + token } }).catch(() => null);
  if (!who?.ok) return out(401, { error: 'Sessão inválida. Entre novamente.' });
  const me = await who.json();
  try {
    const profile = (await sb(`profiles?id=eq.${encodeURIComponent(me.id)}&select=role`))?.[0];
    if (!TEAM.includes(profile?.role)) return out(403, { error: 'Sem permissão.' });
    if (body.action === 'list') {
      const filter = body.includeImported === true ? '' : '&status=eq.novo';
      const items = await sb(`form_submissions?select=id,received_at,top,participant_name,status,record${filter}&order=received_at.asc&limit=500`);
      return out(200, { items: (items || []).map(i => ({ id: i.id, receivedAt: i.received_at, top: i.top, name: i.participant_name, status: i.status, record: i.record })) });
    }
    if (body.action === 'mark') {
      const ids = Array.isArray(body.ids) ? body.ids : [];
      if (!ids.length || ids.length > 500 || !ids.every(id => typeof id === 'string' && UUID.test(id))) return out(400, { error: 'Ids inválidos.' });
      const rows = await sb(`form_submissions?id=in.(${ids.join(',')})`, { method: 'PATCH', body: JSON.stringify({ status: 'importado', imported_by: me.id, imported_at: new Date().toISOString() }) });
      return out(200, { marked: Array.isArray(rows) ? rows.length : 0 });
    }
    return out(400, { error: 'Ação inválida.' });
  } catch { return out(500, { error: 'Não foi possível concluir a operação.' }); }
}
