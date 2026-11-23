// Prova, no site publicado e na Evolution real, que o admin consegue gerar o QR code do WhatsApp.
// Usa um admin descartável. Não envia mensagem a ninguém e nunca imprime chaves.
// Uso: SUPABASE_ACCESS_TOKEN=... node scripts/verify-whatsapp-connect.mjs
const REF = 'wwfkazbjiutihtexqknm', base = `https://${REF}.supabase.co`, MGMT = process.env.SUPABASE_ACCESS_TOKEN, APP = process.env.APP_URL || 'https://triagemhakunas.vercel.app';
if (!MGMT) throw Error('Defina SUPABASE_ACCESS_TOKEN.');
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: 'Bearer ' + MGMT } })).json();
const anon = keys.find(k => k.name === 'anon').api_key, service = keys.find(k => k.name === 'service_role').api_key;
const adm = (p, i = {}) => fetch(base + p, { ...i, headers: { apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json', ...(i.headers || {}) } });
const sql = q => fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: 'POST', headers: { Authorization: 'Bearer ' + MGMT, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) });
const email = `wa-${Date.now()}@example.com`, password = 'Prov1sória-' + Math.random().toString(36).slice(2) + '!';
const u = await (await adm('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password, email_confirm: true }) })).json();
const results = []; const check = (n, ok, d = '') => { results.push(ok); console.log((ok ? 'OK     ' : 'FALHOU ') + n + (ok ? '' : ' -> ' + d)); };
const call = async (tok, type) => { const r = await fetch(APP + '/api/alert', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ type }) }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
try {
  const login = async () => (await (await fetch(base + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json()).access_token;
  let tok = await login();
  check('triador comum não consegue conectar o WhatsApp', (await call(tok, 'wa-connect')).status === 403);
  await sql(`update public.profiles set role='admin_master' where id='${u.id}'`);
  tok = await login();
  const st = await call(tok, 'wa-status');
  check('admin consulta o estado do WhatsApp', st.status === 200 && ['absent', 'close', 'connecting', 'open'].includes(st.json.state), JSON.stringify(st.json));
  const c = await call(tok, 'wa-connect');
  console.log('   estado:', c.json.state, '| QR gerado:', c.json.qr ? 'sim (' + c.json.qr.length + ' caracteres)' : 'não', c.json.error ? '| erro: ' + c.json.error : '');
  check('conectar devolve o QR code como imagem PNG (ou já está conectado)', c.status === 200 && (c.json.state === 'open' || /^data:image\/png;base64,/.test(c.json.qr || '')), JSON.stringify({ ...c.json, qr: c.json.qr ? '[qr]' : undefined }));
  check('a resposta não expõe nenhuma chave', !/apikey|api_key|hash|[0-9a-f]{40,}/i.test(JSON.stringify({ ...c.json, qr: undefined })));
  const saved = await (await sql("select instance from public.alert_settings")).json();
  check('o nome da instância foi guardado sozinho', saved[0]?.instance === 'triagem-hakunas', JSON.stringify(saved));
} finally {
  if (u?.id) await adm('/auth/v1/admin/users/' + u.id, { method: 'DELETE' });
}
const failed = results.filter(x => !x).length;
console.log(`\n${results.length - failed}/${results.length} verificações passaram.`);
process.exit(failed ? 1 : 0);
