// Prova a função /api/alert no site publicado, contra o banco real, com usuário e participante fictícios.
// Uso: SUPABASE_ACCESS_TOKEN=... [APP_URL=https://triagemhakunas.vercel.app] node scripts/verify-alert-api.mjs
const REF = 'wwfkazbjiutihtexqknm', base = `https://${REF}.supabase.co`, MGMT = process.env.SUPABASE_ACCESS_TOKEN, APP = process.env.APP_URL || 'https://triagemhakunas.vercel.app';
if (!MGMT) throw Error('Defina SUPABASE_ACCESS_TOKEN.');
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: 'Bearer ' + MGMT } })).json();
const anon = keys.find(k => k.name === 'anon').api_key, service = keys.find(k => k.name === 'service_role').api_key;
const admin = (path, init = {}) => fetch(base + path, { ...init, headers: { apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json', ...(init.headers || {}) } });
const results = []; const check = (n, ok, d = '') => { results.push(ok); console.log((ok ? 'OK     ' : 'FALHOU ') + n + (ok ? '' : ' -> ' + d)); };
const email = `alert-${Date.now()}@example.com`, password = 'Prov1sória-' + Math.random().toString(36).slice(2) + '!';
const user = await (await admin('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password, email_confirm: true }) })).json();
const call = async (token, body) => { const r = await fetch(APP + '/api/alert', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
const NAME = 'Participante Fictício ' + Date.now();
try {
  const login = await (await fetch(base + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json();
  const tok = login.access_token;
  check('sem login é recusado', (await call('', { type: 'use' })).status === 401);
  check('token falso é recusado', (await call('falso', { type: 'use' })).status === 401);
  const people = [{ name: NAME, phone: '11 90000-0000', email: 'ficticio@exemplo.com', color: 'red', reasons: ['Hipertensão (teste)'] }, { name: 'Verde Ignorado', color: 'green', reasons: [] }];
  const r1 = await call(tok, { type: 'risk', people, meta: { event: 'TOP TESTE' } });
  check('risco: grava só o vermelho', r1.status === 200 && r1.json.saved === 1, JSON.stringify(r1));
  check('risco: sem configuração do WhatsApp, avisa em vez de falhar', r1.json.sent === false && /configura|destinat|desativ/i.test(r1.json.error || ''), JSON.stringify(r1.json));
  const rows = await (await admin('/rest/v1/alerts?participant_name=eq.' + encodeURIComponent(NAME) + '&select=color,reasons,participant_email')).json();
  check('alerta ficou gravado no banco com motivo e e-mail', rows.length === 1 && rows[0].color === 'red' && rows[0].reasons[0].includes('Hipertensão'), JSON.stringify(rows));
  const r2 = await call(tok, { type: 'risk', people });
  check('repetir a mesma pessoa não duplica (24 h)', r2.json.saved === 0 && r2.json.skipped >= 1, JSON.stringify(r2.json));
  check('triador comum não faz o teste de conexão', (await call(tok, { type: 'test' })).status === 403);
  const peek = await fetch(base + '/rest/v1/alerts?select=participant_name', { headers: { apikey: anon, Authorization: 'Bearer ' + tok } });
  check('triador comum não lê a tabela de alertas', (await peek.json()).length === 0);
  const peek2 = await fetch(base + '/rest/v1/alert_settings?select=api_key', { headers: { apikey: anon, Authorization: 'Bearer ' + tok } });
  check('triador comum não lê a chave da Evolution', (await peek2.json()).length === 0);
} finally {
  await admin('/rest/v1/alerts?participant_name=like.' + encodeURIComponent('Participante Fictício *'), { method: 'DELETE' });
  if (user?.id) await admin('/auth/v1/admin/users/' + user.id, { method: 'DELETE' });
}
const failed = results.filter(x => !x).length;
console.log(`\n${results.length - failed}/${results.length} verificações passaram.`);
process.exit(failed ? 1 : 0);
