// Lógica do endpoint /api/alert (testável, sem depender da Vercel).
import { normalizePeople, sendAlerts, sendTexts } from './server.js';
const clip = (v, n) => String(v ?? '').trim().slice(0, n);
const out = (status, json) => ({ status, json });

export async function handleAlert({ method, authorization, body } = {}, { fetch: f, supabaseUrl, anonKey, serviceKey }) {
  if (method !== 'POST') return out(405, { error: 'Método não permitido.' });
  const token = /^Bearer (.+)$/.exec(authorization || '')?.[1];
  if (!token) return out(401, { error: 'Entre com sua conta.' });
  if (!body || typeof body !== 'object' || !['risk', 'use', 'test'].includes(body.type)) return out(400, { error: 'Pedido inválido.' });
  const who = await f(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: 'Bearer ' + token } }).catch(() => null);
  if (!who?.ok) return out(401, { error: 'Sessão inválida. Entre novamente.' });
  const user = await who.json();
  const sb = async (path, init = {}) => {
    const r = await f(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) } });
    if (!r.ok) throw Error('banco ' + r.status);
    const t = await r.text(); return t ? JSON.parse(t) : null;
  };
  try {
    const profile = (await sb(`profiles?id=eq.${encodeURIComponent(user.id)}&select=full_name,legend_number,role,email`))?.[0];
    if (!profile) return out(403, { error: 'Perfil não encontrado.' });
    const settings = (await sb('alert_settings?select=*'))?.[0] || {};
    const recipients = (await sb('alert_recipients?select=name,whatsapp,active')) || [];
    const name = profile.full_name || profile.email || 'Usuário';

    if (body.type === 'test') {
      if (profile.role !== 'admin_master') return out(403, { error: 'Somente o admin master.' });
      const deliveries = await sendTexts({ texts: ['✅ Teste de conexão da Triagem Hakunas: se você recebeu esta mensagem, o envio de alertas está funcionando.'], settings, recipients, fetch: f }).catch(e => ({ error: e.message }));
      return out(200, deliveries.error ? { sent: false, error: deliveries.error } : { sent: deliveries.some(d => d.ok), deliveries });
    }
    if (body.type === 'use') {
      if (!settings.notify_use || !settings.active) return out(200, { sent: false });
      const hora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
      const text = `ℹ️ ${name}${profile.legend_number ? ' (Legendário nº ' + profile.legend_number + ')' : ''} entrou na Triagem Hakunas em ${hora}.`;
      const deliveries = await sendTexts({ texts: [text], settings, recipients, fetch: f }).catch(e => ({ error: e.message }));
      return out(200, deliveries.error ? { sent: false, error: deliveries.error } : { sent: deliveries.some(d => d.ok) });
    }

    // type === 'risk'
    const people = normalizePeople(body.people);
    if (!people.length) return out(200, { saved: 0, skipped: 0, sent: false });
    const since = new Date(Date.now() - 24 * 3600000).toISOString();
    const recent = (await sb(`alerts?select=participant_name,participant_phone,color&created_at=gte.${encodeURIComponent(since)}&limit=2000`)) || [];
    const key = (n, p, c) => [n, p, c].map(s => String(s).toLowerCase()).join('|');
    const seen = new Set(recent.map(a => key(a.participant_name, a.participant_phone, a.color)));
    const fresh = people.filter(p => !seen.has(key(p.name, p.phone, p.color)));
    if (!fresh.length) return out(200, { saved: 0, skipped: people.length, sent: false });
    const rows = await sb('alerts', { method: 'POST', body: JSON.stringify(fresh.map(p => ({ triager_id: user.id, color: p.color, participant_name: p.name, participant_phone: p.phone, participant_email: p.email, reasons: p.reasons }))) });
    let deliveries = [], error = '';
    try { deliveries = await sendAlerts({ people: fresh, settings, recipients, meta: { triager: name, event: clip(body.meta?.event, 200) }, fetch: f }); }
    catch (e) { error = e.message; deliveries = [{ ok: false, error }]; }
    const ids = rows.map(r => r.id).join(',');
    await sb(`alerts?id=in.(${ids})`, { method: 'PATCH', body: JSON.stringify({ delivery: deliveries }) }).catch(() => {});
    return out(200, { saved: fresh.length, skipped: people.length - fresh.length, sent: deliveries.some(d => d.ok), deliveries, ...(error ? { error } : {}) });
  } catch (e) {
    return out(500, { error: 'Não foi possível concluir o alerta.' });
  }
}
