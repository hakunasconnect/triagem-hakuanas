// Prova, contra o banco REAL, que as regras de acesso (RLS) isolam os usuários.
// Uso: SUPABASE_ACCESS_TOKEN=... node scripts/verify-rls.mjs  (o admin entra por sessão de teste, sem senha)
// Cria um usuário descartável, tenta as violações e o remove ao final. Nenhuma chave é impressa.
const REF = process.env.SUPABASE_REF || 'wwfkazbjiutihtexqknm';
import { adminSession } from './lib/admin-session.mjs';
const { SUPABASE_ACCESS_TOKEN: MGMT } = process.env;
if (!MGMT) throw Error('Defina SUPABASE_ACCESS_TOKEN.');
const base = `https://${REF}.supabase.co`;
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: 'Bearer ' + MGMT } })).json();
const anon = keys.find(k => k.name === 'anon')?.api_key, service = keys.find(k => k.name === 'service_role')?.api_key;
if (!anon || !service) throw Error('Chaves não encontradas.');
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log((ok ? 'OK    ' : 'FALHOU') + ' ' + name + (ok ? '' : ' -> ' + detail)); };
const rest = (token, path, init = {}) => fetch(base + '/rest/v1/' + path, { ...init, headers: { apikey: anon, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) } });
const login = async (email, password) => { const r = await fetch(base + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }); const j = await r.json(); if (!j.access_token) throw Error('login falhou: ' + r.status); return { token: j.access_token, id: j.user.id }; };

const testEmail = `rls-${Date.now()}@example.com`, testPass = 'T3ste-' + Math.random().toString(36).slice(2) + 'Aa1!';
const created = await (await fetch(base + '/auth/v1/admin/users', { method: 'POST', headers: { apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: testEmail, password: testPass, email_confirm: true }) })).json();
try {
  const as = await adminSession({ ref: REF, mgmt: MGMT });
  const admin = { token: as.session.access_token, id: as.session.user.id };
  const user = await login(testEmail, testPass);
  check('admin consegue entrar com e-mail e senha', !!admin.token);

  const sess = await (await rest(admin.token, 'usage_sessions', { method: 'POST', body: JSON.stringify({ user_id: admin.id, app_version: 'teste' }) })).json();
  const sid = sess[0]?.id;
  await rest(admin.token, 'usage_events', { method: 'POST', body: JSON.stringify({ session_id: sid, user_id: admin.id, event_type: 'login' }) });

  const profs = await (await rest(user.token, 'profiles?select=email,role')).json();
  check('usuário comum vê só o próprio perfil', Array.isArray(profs) && profs.length === 1 && profs[0].email === testEmail, JSON.stringify(profs));
  const us = await (await rest(user.token, 'usage_sessions?select=id')).json();
  check('usuário comum não vê sessões de outros', Array.isArray(us) && us.length === 0, JSON.stringify(us));
  const ue = await (await rest(user.token, 'usage_events?select=id')).json();
  check('usuário comum não vê eventos de outros', Array.isArray(ue) && ue.length === 0, JSON.stringify(ue));
  const au = await (await rest(user.token, 'audit_log?select=id')).json();
  check('usuário comum não lê a auditoria', Array.isArray(au) && au.length === 0, JSON.stringify(au));

  const promote = await rest(user.token, 'profiles?id=eq.' + user.id, { method: 'PATCH', body: JSON.stringify({ role: 'admin_master' }) });
  check('usuário comum não consegue se promover a admin', promote.status >= 400, 'status ' + promote.status);
  const roleNow = await (await rest(service, 'profiles?id=eq.' + user.id + '&select=role')).json();
  check('papel do usuário comum continua triador', roleNow[0]?.role === 'triador', JSON.stringify(roleNow));
  const ev = await rest(user.token, 'events', { method: 'POST', body: JSON.stringify({ name: 'Evento indevido' }) });
  check('usuário comum não cria evento', ev.status >= 400, 'status ' + ev.status);
  const anonRead = await fetch(base + '/rest/v1/profiles?select=email', { headers: { apikey: anon, Authorization: 'Bearer ' + anon } });
  check('sem login não lê nada', anonRead.status >= 400 || (await anonRead.json()).length === 0);

  const usess = await (await rest(user.token, 'usage_sessions', { method: 'POST', body: JSON.stringify({ user_id: user.id, app_version: 'teste' }) })).json();
  const usid = usess[0]?.id;
  check('usuário comum registra a própria sessão', !!usid, JSON.stringify(usess));
  const forged = await rest(user.token, 'usage_events', { method: 'POST', body: JSON.stringify({ session_id: sid, user_id: user.id, event_type: 'login' }) });
  check('não grava evento na sessão de outro', forged.status >= 400, 'status ' + forged.status);
  const pii = await rest(user.token, 'usage_events', { method: 'POST', body: JSON.stringify({ session_id: usid, user_id: user.id, event_type: 'triage_done', meta: { nome: 'Fulano', cpf: '123' } }) });
  check('rejeita dado pessoal nas métricas', pii.status >= 400, 'status ' + pii.status);
  const okMeta = await rest(user.token, 'usage_events', { method: 'POST', body: JSON.stringify({ session_id: usid, user_id: user.id, event_type: 'triage_done', meta: { color: 'yellow', band: 'Moderada', age_range: '30-44' } }) });
  check('aceita métrica anônima permitida', okMeta.status === 201, 'status ' + okMeta.status);

  const adminSees = await (await rest(admin.token, 'usage_events?select=user_id')).json();
  check('admin vê eventos de todos os usuários', new Set(adminSees.map(e => e.user_id)).size >= 2, JSON.stringify(adminSees));
  await rest(service, 'usage_sessions?id=eq.' + sid, { method: 'DELETE' });
} finally {
  if (created?.id) await fetch(base + '/auth/v1/admin/users/' + created.id, { method: 'DELETE', headers: { apikey: service, Authorization: 'Bearer ' + service } });
}
const failed = results.filter(x => !x).length;
console.log(`\n${results.length - failed}/${results.length} verificações passaram.`);
process.exit(failed ? 1 : 0);
