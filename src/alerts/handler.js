// Lógica do endpoint /api/alert (testável, sem depender da Vercel).
import { normalizePeople, sendAlerts, sendTexts, normalizeNumber, buildSummaryMessages, summaryCounts } from './server.js';
import { createEvolution } from './evolution.js';
const clip = (v, n) => String(v ?? '').trim().slice(0, n);
const out = (status, json) => ({ status, json });

export async function handleAlert({ method, authorization, body } = {}, { fetch: f, supabaseUrl, anonKey, serviceKey, evolutionKey = '' }) {
  if (method !== 'POST') return out(405, { error: 'Método não permitido.' });
  const token = /^Bearer (.+)$/.exec(authorization || '')?.[1];
  if (!token) return out(401, { error: 'Entre com sua conta.' });
  if (!body || typeof body !== 'object' || !['risk', 'use', 'start', 'summary', 'test', 'wa-connect', 'wa-status'].includes(body.type)) return out(400, { error: 'Pedido inválido.' });
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
    const stored = (await sb('alert_settings?select=*'))?.[0] || {};
    const settings = { ...stored, api_key: stored.api_key || evolutionKey || '' };
    const recipients = (await sb('alert_recipients?select=name,whatsapp,active')) || [];
    const name = profile.full_name || profile.email || 'Usuário';

    if (body.type === 'wa-connect' || body.type === 'wa-status') {
      if (profile.role !== 'admin_master') return out(403, { error: 'Somente o admin master.' });
      if (!evolutionKey || !stored.evolution_url) return out(200, { state: 'unconfigured', error: 'Falta a chave da Evolution no servidor.' });
      const evo = createEvolution({ url: stored.evolution_url, key: evolutionKey, fetch: f });
      const instance = stored.instance || 'triagem-hakunas';
      try {
        let state = await evo.state(instance);
        if (body.type === 'wa-status' || state === 'open') return out(200, { state });
        const number = normalizeNumber(body.number);
        let qr, pairingCode;
        if (state === 'absent') { ({ qr } = await evo.create(instance)); state = 'connecting'; }
        if (!qr || number) ({ qr: qr = qr, pairingCode } = await evo.qr(instance, number));
        if (stored.instance !== instance) await sb('alert_settings?id=eq.true', { method: 'PATCH', body: JSON.stringify({ instance, updated_at: new Date().toISOString() }) });
        return out(200, { state, ...(qr ? { qr } : {}), ...(number && pairingCode ? { pairingCode } : {}) });
      } catch (e) { return out(200, { state: 'error', error: e.message }); }
    }
    if (body.type === 'test') {
      if (profile.role !== 'admin_master') return out(403, { error: 'Somente o admin master.' });
      const deliveries = await sendTexts({ texts: ['✅ Teste de conexão da Triagem Hakunas: se você recebeu esta mensagem, o envio de alertas está funcionando.'], settings, recipients, fetch: f }).catch(e => ({ error: e.message }));
      return out(200, deliveries.error ? { sent: false, error: deliveries.error } : { sent: deliveries.some(d => d.ok), deliveries });
    }
    const legend = profile.legend_number || '', eventLabel = clip(body.meta?.event, 200);
    if (body.type === 'start') {
      const n = Number.isInteger(body.count) && body.count > 0 ? Math.min(body.count, 100000) : 0;
      const text = `👤 ${name}${legend ? ' (Legendário nº ' + legend + ')' : ''} iniciou uma triagem${n ? ' de ' + n + ' participante(s)' : ''}${eventLabel ? ' — ' + eventLabel : ''}.`;
      const deliveries = await sendTexts({ texts: [text], settings, recipients, fetch: f }).catch(e => ({ error: e.message }));
      return out(200, deliveries.error ? { sent: false, error: deliveries.error } : { sent: deliveries.some(d => d.ok) });
    }
    if (body.type === 'summary') {
      const people = normalizePeople(body.people), counts = summaryCounts(body.counts);
      let saved = 0;
      try {
        await sb('triage_summaries', { method: 'POST', body: JSON.stringify({ triager_id: user.id, event_label: eventLabel, total: counts.total, green: counts.green, yellow: counts.yellow, red: counts.red, black: counts.black }) });
        if (people.length) {
          const since = new Date(Date.now() - 24 * 3600000).toISOString();
          const recent = (await sb(`alerts?select=participant_name,participant_phone,color&created_at=gte.${encodeURIComponent(since)}&limit=2000`)) || [];
          const k = (n, p, c) => [n, p, c].map(s => String(s).toLowerCase()).join('|');
          const seen = new Set(recent.map(a => k(a.participant_name, a.participant_phone, a.color)));
          const fresh = people.filter(p => !seen.has(k(p.name, p.phone, p.color)));
          if (fresh.length) { await sb('alerts', { method: 'POST', body: JSON.stringify(fresh.map(p => ({ triager_id: user.id, color: p.color, participant_name: p.name, participant_phone: p.phone, participant_email: p.email, reasons: p.reasons }))) }); saved = fresh.length; }
        }
      } catch {}
      const texts = buildSummaryMessages({ counts, people, triager: name, legend, event: eventLabel });
      const deliveries = await sendTexts({ texts, settings, recipients, fetch: f }).catch(e => ({ error: e.message }));
      return out(200, deliveries.error ? { saved, sent: false, error: deliveries.error } : { saved, sent: deliveries.some(d => d.ok), deliveries });
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
