// Cliente mínimo do Supabase (Auth + REST) para o painel. Sem SDK: poucas linhas auditáveis.
const SESSION_KEY = 'hakunas-admin-session';

export function validateNewPassword(value, current = '') {
  const p = String(value ?? '');
  if (p.length < 10) throw Error('A senha deve ter pelo menos 10 caracteres.');
  if (!/[A-Za-zÀ-ÿ]/.test(p)) throw Error('A senha deve ter pelo menos uma letra.');
  if (!/\d/.test(p)) throw Error('A senha deve ter pelo menos um número.');
  if (!/[^A-Za-z0-9À-ÿ]/.test(p)) throw Error('A senha deve ter pelo menos um símbolo (por exemplo ! ou -).');
  if (current && p === current) throw Error('A nova senha deve ser diferente da atual.');
  return p;
}

export function createAdminClient({ url, anonKey, fetch: f = globalThis.fetch?.bind(globalThis), storage } = {}) {
  let session = null;
  const keep = () => { try { storage?.setItem(SESSION_KEY, JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token, user: session.user })); } catch {} };
  const forget = () => { session = null; try { storage?.removeItem(SESSION_KEY); } catch {} };
  try { const raw = storage?.getItem(SESSION_KEY); if (raw) session = JSON.parse(raw); } catch { session = null; }
  const head = token => ({ apikey: anonKey, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' });
  const auth = async (query, body) => {
    const r = await f(`${url}/auth/v1/token?grant_type=${query}`, { method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, body: j };
  };
  async function refresh() {
    if (!session?.refresh_token) { forget(); throw Error('Sessão expirada. Entre novamente.'); }
    const { ok, body } = await auth('refresh_token', { refresh_token: session.refresh_token });
    if (!ok || !body.access_token) { forget(); throw Error('Sessão expirada. Entre novamente.'); }
    session = { access_token: body.access_token, refresh_token: body.refresh_token || session.refresh_token, user: body.user || session.user };
    keep();
  }
  async function call(path, init = {}, retry = true) {
    if (!session) throw Error('Entre com seu e-mail e senha.');
    const r = await f(url + path, { ...init, headers: { ...head(session.access_token), Prefer: 'return=representation', ...(init.headers || {}) } });
    if (r.status === 401 && retry) { await refresh(); return call(path, init, false); }
    if (!r.ok) throw Error('Não foi possível concluir a operação (' + r.status + ').');
    const text = await r.text(); return text ? JSON.parse(text) : null;
  }
  return {
    get user() { return session?.user ?? null; },
    get signedIn() { return !!session; },
    async signIn(email, password) {
      const { ok, body } = await auth('password', { email, password });
      if (!ok || !body.access_token) throw Error('E-mail ou senha incorretos.');
      session = { access_token: body.access_token, refresh_token: body.refresh_token, user: body.user }; keep(); return session;
    },
    async signOut() {
      try { if (session) await f(url + '/auth/v1/logout', { method: 'POST', headers: head(session.access_token) }); } catch {}
      forget();
    },
    rest: (path, init) => call('/rest/v1/' + path, init),
    async changePassword(next, current = '') {
      validateNewPassword(next, current);
      await call('/auth/v1/user', { method: 'PUT', body: JSON.stringify({ password: next }) });
      await call('/rest/v1/profiles?id=eq.' + session.user.id, { method: 'PATCH', body: JSON.stringify({ must_change_password: false }) });
    },
  };
}
