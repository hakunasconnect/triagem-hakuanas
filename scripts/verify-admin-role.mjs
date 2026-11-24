// Prova, no site publicado e no banco real, o papel "admin" (abaixo do admin master) e suas permissões.
// Cria um admin descartável pelo admin master (sessão de teste, sem segundo master) e remove tudo ao final.
// Uso: SUPABASE_ACCESS_TOKEN=... node scripts/verify-admin-role.mjs
import { adminSession } from './lib/admin-session.mjs';
const REF = 'wwfkazbjiutihtexqknm', MGMT = process.env.SUPABASE_ACCESS_TOKEN, APP = process.env.APP_URL || 'https://triagemhakunas.vercel.app';
if (!MGMT) throw Error('Defina SUPABASE_ACCESS_TOKEN.');
const { base, anon, service, session } = await adminSession({ ref: REF, mgmt: MGMT });
const results = []; const check = (n, ok, d = '') => { results.push(ok); console.log((ok ? 'OK     ' : 'FALHOU ') + n + (ok ? '' : ' -> ' + d)); };
const users = (tok, body) => fetch(APP + '/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, json: await r.json().catch(() => ({})) }));
const alertApi = (tok, body) => fetch(APP + '/api/alert', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, json: await r.json().catch(() => ({})) }));
const rest = (tok, path, init = {}) => fetch(base + '/rest/v1/' + path, { ...init, headers: { apikey: anon, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) } });
const svc = (p, i = {}) => fetch(base + p, { ...i, headers: { apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json', ...(i.headers || {}) } });
const master = session.access_token, masterId = session.user.id;
const email = `adm-${Date.now()}@example.com`, pass = 'Provisoria-' + Math.random().toString(36).slice(2) + '9!';
const made = []; let admId;
try {
  const c = await users(master, { action: 'create', email, role: 'admin', password: pass, full_name: 'Admin Teste' });
  admId = c.json.id; check('admin master cria um admin (senha provisória, troca obrigatória)', c.status === 200 && !!admId, JSON.stringify(c));
  const prof = await (await svc('/rest/v1/profiles?id=eq.' + admId + '&select=role,must_change_password,permissions')).json();
  check('admin nasce com troca de senha obrigatória e tudo liberado', prof[0]?.role === 'admin' && prof[0]?.must_change_password === true && Object.keys(prof[0]?.permissions || {}).length === 0, JSON.stringify(prof));
  const adm = (await (await fetch(base + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pass }) })).json()).access_token;
  check('admin consegue entrar', !!adm);

  for (const [t, label] of [['usage_events', 'métricas'], ['alerts', 'alertas'], ['triage_summaries', 'resumos']]) {
    const r = await rest(adm, t + '?select=*&limit=1'); check(`com tudo liberado, admin acessa ${label}`, r.status === 200, 'status ' + r.status);
  }
  // O que é do admin master é só dele (migração 0008): o admin nem enxerga a configuração do WhatsApp nem os destinatários.
  // Só leitura e uma inserção com número fictício (apagada ao final): nada real é alterado ou apagado por este teste.
  for (const [t, label] of [['alert_recipients', 'destinatários'], ['alert_settings', 'configuração do WhatsApp']]) {
    const rows = await (await rest(adm, t + '?select=id&limit=5')).json();
    check(`admin não enxerga ${label} (só o admin master)`, Array.isArray(rows) && rows.length === 0, JSON.stringify(rows).slice(0, 100));
  }
  const fakeNumber = '55110000' + String(Date.now()).slice(-6);
  const addRcp = await rest(adm, 'alert_recipients', { method: 'POST', body: JSON.stringify({ name: 'Teste Admin', whatsapp: fakeNumber }) });
  check('admin não cadastra destinatário', addRcp.status >= 400, 'status ' + addRcp.status);
  await svc('/rest/v1/alert_recipients?whatsapp=eq.' + fakeNumber, { method: 'DELETE' }); // limpeza, caso a regra falhe
  const wa = await alertApi(adm, { type: 'wa-status' });
  check(`admin não consulta nem conecta o WhatsApp (HTTP ${wa.status})`, wa.status === 403, JSON.stringify(wa.json).slice(0, 100));
  const audit = await (await rest(adm, 'audit_log?select=id&limit=1')).json();
  check('admin não lê a auditoria (só o master)', Array.isArray(audit) && audit.length === 0, JSON.stringify(audit));

  const before = (await (await svc('/rest/v1/profiles?id=eq.' + masterId + '&select=full_name,role')).json())[0];
  await rest(adm, 'profiles?id=eq.' + masterId, { method: 'PATCH', body: JSON.stringify({ full_name: 'HACKEADO' }) });
  const after = (await (await svc('/rest/v1/profiles?id=eq.' + masterId + '&select=full_name,role')).json())[0];
  check('admin não altera o perfil do admin master pelo banco', after.full_name === before.full_name && after.role === 'admin_master', JSON.stringify(after));
  const rolePatch = await rest(adm, 'profiles?id=eq.' + admId, { method: 'PATCH', body: JSON.stringify({ role: 'admin_master' }) });
  check('admin não se promove a admin master', rolePatch.status >= 400 || (await svc('/rest/v1/profiles?id=eq.' + admId + '&select=role').then(r => r.json()))[0].role === 'admin', 'status ' + rolePatch.status);

  for (const [label, body] of [['editar', { action: 'update', id: masterId, full_name: 'x' }], ['trocar a senha d', { action: 'reset-password', id: masterId, password: 'Hackeado-123' }], ['apagar', { action: 'delete', id: masterId }], ['rebaixar', { action: 'update', id: masterId, role: 'triador' }]]) {
    const r = await users(adm, body); check(`admin não consegue ${label}o admin master (HTTP ${r.status})`, r.status === 403, JSON.stringify(r));
  }
  const still = await (await svc('/rest/v1/profiles?id=eq.' + masterId + '&select=role')).json();
  check('o admin master continua intacto e único', still[0]?.role === 'admin_master' && (await (await svc('/rest/v1/profiles?role=eq.admin_master&select=id')).json()).length === 1);

  const t = await users(adm, { action: 'create', email: `tri-${Date.now()}@example.com`, role: 'triador', password: 'Provisoria-Tri-9!' });
  check('admin cria um triador', t.status === 200 && !!t.json.id, JSON.stringify(t)); if (t.json.id) made.push(t.json.id);
  check('admin não cria outro admin', (await users(adm, { action: 'create', email: `x-${Date.now()}@example.com`, role: 'admin' })).status === 400);
  check('admin não define permissões', (await users(adm, { action: 'set-permissions', id: admId, permissions: {} })).status === 403);
  if (t.json.id) check('admin apaga o triador que criou', (await users(adm, { action: 'delete', id: t.json.id })).status === 200);

  // O admin master desliga permissões: o que era liberado passa a ser negado.
  const sp = await users(master, { action: 'set-permissions', id: admId, permissions: { view_metrics: false, manage_users: false, view_alerts: false } });
  check('admin master define as permissões do admin', sp.status === 200, JSON.stringify(sp));
  const others = await (await svc('/rest/v1/usage_events?select=id&user_id=neq.' + admId + '&limit=1')).json();
  check('pré-condição: existem eventos de outros usuários (senão o teste abaixo seria vazio)', Array.isArray(others) && others.length > 0, JSON.stringify(others));
  const m2 = await (await rest(adm, 'usage_events?select=user_id&limit=50')).json();
  check('sem view_metrics, o admin deixa de ver métricas de outros', Array.isArray(m2) && !m2.some(e => e.user_id !== admId), JSON.stringify(m2).slice(0, 120));
  // Guarda que só existe como concessão por coluna (0001): o admin não pode se liberar gravando permissions direto.
  const lift = await rest(adm, 'profiles?id=eq.' + admId, { method: 'PATCH', body: JSON.stringify({ permissions: {} }) });
  const kept = (await (await svc('/rest/v1/profiles?id=eq.' + admId + '&select=permissions')).json())[0]?.permissions;
  check('admin não se auto-libera: gravar permissions direto no banco é recusado e nada muda', lift.status >= 400 && kept?.view_metrics === false, `status ${lift.status} ${JSON.stringify(kept)}`);
  const a2 = await (await rest(adm, 'alerts?select=id&limit=1')).json();
  check('sem view_alerts, o admin deixa de ver alertas', Array.isArray(a2) && a2.length === 0, JSON.stringify(a2));
  check('sem manage_users, o admin não gerencia usuários', (await users(adm, { action: 'create', email: `y-${Date.now()}@example.com`, role: 'triador' })).status === 403);
} finally {
  for (const id of made) await svc('/auth/v1/admin/users/' + id, { method: 'DELETE' });
  if (admId) await svc('/auth/v1/admin/users/' + admId, { method: 'DELETE' });
}
if (admId) { const gone = await (await svc('/rest/v1/profiles?id=eq.' + admId + '&select=id')).json(); check('limpeza: apagar um admin que gerou auditoria funciona (FK com SET NULL)', Array.isArray(gone) && gone.length === 0, JSON.stringify(gone)); }
const failed = results.filter(x => !x).length;
console.log(`\n${results.length - failed}/${results.length} verificações passaram.`);
process.exit(failed ? 1 : 0);
