// Alertas de triagem em risco (vermelho/preto) por WhatsApp, via Evolution API.
// Roda no servidor: a chave da Evolution nunca chega ao navegador.
const COLOR_LABEL = { red: 'VERMELHO', black: 'PRETO' };
const MAX_PEOPLE = 200, MAX_MESSAGE = 3500;
const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);

export function normalizeNumber(v) {
  const d = String(v ?? '').replace(/\D/g, '');
  return d.length >= 10 && d.length <= 15 ? d : '';
}
export function normalizePeople(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const p of list) {
    if (!p || typeof p !== 'object' || !(p.color in COLOR_LABEL)) continue;
    out.push({
      name: clip(p.name, 200) || 'Nome não informado', color: p.color, phone: clip(p.phone, 40), email: clip(p.email, 200),
      reasons: (Array.isArray(p.reasons) ? p.reasons : []).slice(0, 20).map(r => clip(r, 200)).filter(Boolean),
    });
    if (out.length >= MAX_PEOPLE) break;
  }
  return out;
}
export function buildMessages(people, { triager = '', event = '' } = {}) {
  const entries = people.map((p, i) =>
    `${i + 1}. ${p.name} — ${COLOR_LABEL[p.color]}\n   Motivos: ${(p.reasons.join('; ') || 'não informado').slice(0, 600)}\n   Tel: ${p.phone || 'não informado'} · E-mail: ${p.email || 'não informado'}`);
  const head = part => `🚨 ALERTA DE TRIAGEM — requer avaliação humana (não é diagnóstico)\n${event ? 'Evento: ' + clip(event, 200) + '\n' : ''}${triager ? 'Triador: ' + clip(triager, 100) + '\n' : ''}${part}\n`;
  const chunks = []; let cur = [], len = head('(parte 99/99)').length;
  for (const e of entries) {
    if (cur.length && len + e.length + 2 > MAX_MESSAGE) { chunks.push(cur); cur = []; len = head('(parte 99/99)').length; }
    cur.push(e); len += e.length + 2;
  }
  if (cur.length) chunks.push(cur);
  return chunks.map((c, i) => head(chunks.length > 1 ? `(parte ${i + 1}/${chunks.length})` : `${entries.length} em risco`) + '\n' + c.join('\n\n'));
}
export async function sendTexts({ texts, settings, recipients, fetch: f = globalThis.fetch }) {
  if (!settings?.active) throw Error('Os alertas estão desativados.');
  if (!settings.evolution_url || !settings.instance || !settings.api_key) throw Error('Configuração da Evolution incompleta (endereço, instância e chave).');
  const to = (recipients || []).filter(r => r.active && normalizeNumber(r.whatsapp));
  if (!to.length) throw Error('Nenhum destinatário ativo cadastrado.');
  const url = `${settings.evolution_url.replace(/\/+$/, '')}/message/sendText/${encodeURIComponent(settings.instance)}`;
  const scrub = s => String(s).split(settings.api_key).join('***').slice(0, 200);
  const results = [];
  for (const r of to) {
    const number = normalizeNumber(r.whatsapp); let ok = true, error = '';
    for (const text of texts) {
      try {
        const res = await f(url, { method: 'POST', headers: { apikey: settings.api_key, 'Content-Type': 'application/json' }, body: JSON.stringify({ number, text }) });
        if (!res.ok) { ok = false; error = 'HTTP ' + res.status; break; }
      } catch (e) { ok = false; error = scrub(e?.message || 'falha de rede'); break; }
    }
    results.push({ name: r.name, whatsapp: number, ok, ...(error ? { error } : {}) });
  }
  return results;
}
export async function sendAlerts({ people, settings, recipients, meta = {}, fetch: f = globalThis.fetch }) {
  if (!people.length) return [];
  return sendTexts({ texts: buildMessages(people, meta), settings, recipients, fetch: f });
}
