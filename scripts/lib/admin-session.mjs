// Sessão de teste do admin master SEM criar um segundo admin (o banco só permite um) e SEM mexer na senha.
// Usa o link de acesso do Supabase gerado pela chave de serviço. Nunca imprime e-mail, token ou chave.
export async function adminSession({ ref, mgmt }) {
  const base = `https://${ref}.supabase.co`;
  const keys = await (await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, { headers: { Authorization: 'Bearer ' + mgmt } })).json();
  const anon = keys.find(k => k.name === 'anon').api_key, service = keys.find(k => k.name === 'service_role').api_key;
  const rows = await (await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: 'POST', headers: { Authorization: 'Bearer ' + mgmt, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: "select email from public.profiles where role='admin_master' limit 1" }) })).json();
  const email = rows[0]?.email; if (!email) throw Error('admin master não encontrado');
  const link = await (await fetch(base + '/auth/v1/admin/generate_link', { method: 'POST', headers: { apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email }) })).json();
  const hashed = link.hashed_token || link.properties?.hashed_token; if (!hashed) throw Error('link de acesso não gerado');
  const s = await (await fetch(base + '/auth/v1/verify', { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: hashed }) })).json();
  if (!s.access_token) throw Error('sessão de teste não obtida');
  return { base, anon, service, session: { access_token: s.access_token, refresh_token: s.refresh_token, user: s.user } };
}
