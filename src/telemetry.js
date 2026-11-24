// Registro de uso do app (quem opera), com login do triador. Nunca envia dado de participante.
// Só funciona depois do login e do aceite; sem rede, a fila espera e o app segue normal.
const COLORS = ['green', 'yellow', 'red', 'black'], BANDS = ['Baixa', 'Moderada', 'Alta', 'Muito alta'];
const AGES = ['16-17', '18-29', '30-44', '45-59', '60+'], FORMATS = ['xlsx', 'csv', 'ods', 'pdf', 'html'];
const TYPES = ['login', 'screen_view', 'triage_done', 'import', 'export', 'settings_change', 'logout'];
const MAX_QUEUE = 200;

export function sanitizeMeta(m) {
  const out = {};
  if (!m || typeof m !== 'object' || Array.isArray(m)) return out;
  if (COLORS.includes(m.color)) out.color = m.color;
  if (BANDS.includes(m.band)) out.band = m.band;
  if (AGES.includes(m.age_range)) out.age_range = m.age_range;
  if (typeof m.screen === 'string' && /^[a-z0-9-]{1,30}$/.test(m.screen)) out.screen = m.screen;
  if (FORMATS.includes(m.format)) out.format = m.format;
  if (Number.isInteger(m.duration_ms) && m.duration_ms >= 0 && m.duration_ms <= 86400000) out.duration_ms = m.duration_ms;
  return out;
}

export function createTelemetry({ url, anonKey, fetch: f = globalThis.fetch?.bind(globalThis), appVersion = '', alertUrl = 'https://triagemhakunas.vercel.app/api/alert' } = {}) {
  let session = null, sessionId = null, queue = [], flushing = false, timer = null;
  const head = () => ({ apikey: anonKey, Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json', Prefer: 'return=representation' });
  const rest = (path, init = {}) => f(url + '/rest/v1/' + path, { ...init, headers: head() });
  const enqueue = (type, meta) => { queue.push({ session_id: sessionId, user_id: session.user.id, event_type: type, occurred_at: new Date().toISOString(), meta: sanitizeMeta(meta) }); if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE); };
  const api = {
    get active() { return !!(session && sessionId); },
    get pending() { return queue.length; },
    async signIn(email, password) {
      let r;
      try { r = await f(url + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }); }
      catch { throw Error('Sem conexão com a internet. O aplicativo funciona normalmente sem o login.'); }
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.access_token) throw Error('E-mail ou senha incorretos.');
      session = { access_token: j.access_token, user: j.user };
      let profile = {};
      try { const pr = await rest('profiles?id=eq.' + session.user.id + '&select=full_name,legend_number'); profile = (await pr.json())?.[0] || {}; } catch {}
      const so = await rest('usage_sessions', { method: 'POST', body: JSON.stringify({ user_id: session.user.id, app_version: String(appVersion).slice(0, 20) }) });
      const created = await so.json().catch(() => null);
      sessionId = created?.[0]?.id || null;
      if (!sessionId) { session = null; throw Error('Não foi possível iniciar o registro de uso. Tente novamente.'); }
      enqueue('login', {}); await api.flush();
      return { fullName: profile.full_name || '', legendNumber: profile.legend_number || '', email: j.user?.email || email };
    },
    track(type, meta = {}) { if (!api.active || !TYPES.includes(type)) return; enqueue(type, meta); if (!timer) { timer = setTimeout(() => { timer = null; api.flush(); }, 3000); timer?.unref?.(); } },
    async flush() {
      if (!api.active || flushing || !queue.length) return;
      flushing = true; const batch = queue.slice();
      try { const r = await rest('usage_events', { method: 'POST', body: JSON.stringify(batch) }); if (r.ok) queue = queue.slice(batch.length); } catch {} finally { flushing = false; }
    },
    async alert(type, payload = {}) {
      if (!session) return null;
      try {
        const r = await f(alertUrl, { method: 'POST', headers: { Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ type, ...payload }) });
        return await r.json();
      } catch { return { error: 'Sem conexão com o servidor de alertas.' }; }
    },
    async intake(action, payload = {}) {
      if (!session) return { error: 'Entre na conta do triador para buscar as inscrições.' };
      try {
        const r = await f(alertUrl.replace(/\/api\/alert$/, '/api/intake'), { method: 'POST', headers: { Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...payload }) });
        return await r.json();
      } catch { return { error: 'Sem conexão com o servidor.' }; }
    },
    async heartbeat() { if (!api.active) return; try { await rest('usage_sessions?id=eq.' + sessionId, { method: 'PATCH', body: JSON.stringify({ last_seen_at: new Date().toISOString() }) }); } catch {} await api.flush(); },
    async end() {
      if (!api.active) return;
      enqueue('logout', {}); await api.flush();
      try { await rest('usage_sessions?id=eq.' + sessionId, { method: 'PATCH', body: JSON.stringify({ ended_at: new Date().toISOString(), last_seen_at: new Date().toISOString() }) }); } catch {}
      try { await f(url + '/auth/v1/logout', { method: 'POST', headers: head() }); } catch {}
      session = null; sessionId = null; queue = [];
    },
  };
  return api;
}
