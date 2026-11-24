// Prova, no site publicado e na Evolution real, que o admin consegue consultar/gerar a conexão do WhatsApp.
// Não envia mensagem a ninguém e nunca imprime chaves. Usa sessão de teste do admin (sem segundo admin).
// Uso: SUPABASE_ACCESS_TOKEN=... node scripts/verify-whatsapp-connect.mjs
import { adminSession } from './lib/admin-session.mjs';
const REF = 'wwfkazbjiutihtexqknm', MGMT = process.env.SUPABASE_ACCESS_TOKEN, APP = process.env.APP_URL || 'https://triagemhakunas.vercel.app';
if (!MGMT) throw Error('Defina SUPABASE_ACCESS_TOKEN.');
const { base, anon, service, session } = await adminSession({ ref: REF, mgmt: MGMT });
const adm = (p, i = {}) => fetch(base + p, { ...i, headers: { apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json', ...(i.headers || {}) } });
const results = []; const check = (n, ok, d = '') => { results.push(ok); console.log((ok ? 'OK     ' : 'FALHOU ') + n + (ok ? '' : ' -> ' + d)); };
const call = async (tok, type) => { const r = await fetch(APP + '/api/alert', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ type }) }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
const email = `wa-${Date.now()}@example.com`, password = 'Prov1sória-' + Math.random().toString(36).slice(2) + '!';
const u = await (await adm('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password, email_confirm: true }) })).json();
try {
  const triTok = (await (await fetch(base + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json()).access_token;
  check('triador comum não consegue conectar o WhatsApp', (await call(triTok, 'wa-connect')).status === 403);
  const st = await call(session.access_token, 'wa-status');
  check('admin consulta o estado do WhatsApp', st.status === 200 && ['absent', 'close', 'connecting', 'open'].includes(st.json.state), JSON.stringify(st.json));
  const c = await call(session.access_token, 'wa-connect');
  console.log('   estado:', c.json.state, '| QR:', c.json.qr ? 'sim' : 'não (já conectado ou indisponível)', c.json.error ? '| erro: ' + c.json.error : '');
  check('conectar devolve o QR como PNG, ou confirma que já está conectado', c.status === 200 && (c.json.state === 'open' || /^data:image\/png;base64,/.test(c.json.qr || '')), JSON.stringify({ ...c.json, qr: c.json.qr ? '[qr]' : undefined }));
  check('a resposta não expõe nenhuma chave', !/apikey|api_key|hash|[0-9a-f]{40,}/i.test(JSON.stringify({ ...c.json, qr: undefined })));
} finally {
  if (u?.id) await adm('/auth/v1/admin/users/' + u.id, { method: 'DELETE' });
}
const failed = results.filter(x => !x).length;
console.log(`\n${results.length - failed}/${results.length} verificações passaram.`);
process.exit(failed ? 1 : 0);
