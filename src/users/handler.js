// Gestão de usuários pelo admin master (endpoint /api/users). Roda no servidor, com a chave de serviço.
// Há um único admin master: ninguém cria outro, e só ele cria, edita, troca a senha e apaga usuários.
import { randomInt } from 'node:crypto';
const out = (status, json) => ({ status, json });
const ROLES = ['triador', 'coordenador'];
const LOWER = 'abcdefghijkmnopqrstuvwxyz', UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ', DIGITS = '23456789', SYMBOLS = '!-_#@';
const pick = s => s[randomInt(s.length)];

export function generatePassword() {
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  const all = LOWER + UPPER + DIGITS + SYMBOLS;
  while (chars.length < 14) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) { const j = randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}
const validPassword = p => typeof p === 'string' && p.length >= 8 && p.length <= 200 && /[A-Za-zÀ-ÿ]/.test(p) && /\d/.test(p);
const clip = (v, n) => String(v ?? '').trim().slice(0, n);

export async function handleUsers({ method, authorization, body } = {}, { fetch: f, supabaseUrl, anonKey, serviceKey }) {
  if (method !== 'POST') return out(405, { error: 'Método não permitido.' });
  const token = /^Bearer (.+)$/.exec(authorization || '')?.[1];
  if (!token) return out(401, { error: 'Entre com sua conta.' });
  if (!body || typeof body !== 'object' || !['create', 'update', 'reset-password', 'delete'].includes(body.action)) return out(400, { error: 'Pedido inválido.' });
  const who = await f(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: 'Bearer ' + token } }).catch(() => null);
  if (!who?.ok) return out(401, { error: 'Sessão inválida. Entre novamente.' });
  const me = await who.json();
  const svc = { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' };
  const sb = async (path, init = {}) => {
    const r = await f(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers: { ...svc, Prefer: 'return=representation', ...(init.headers || {}) } });
    if (!r.ok) throw Error('banco ' + r.status);
    const t = await r.text(); return t ? JSON.parse(t) : null;
  };
  const authAdmin = async (path, init = {}) => {
    const r = await f(`${supabaseUrl}/auth/v1/admin/users${path}`, { ...init, headers: svc });
    if (!r.ok) throw Error('auth ' + r.status);
    const t = await r.text(); return t ? JSON.parse(t) : null;
  };
  const audit = (action, target) => sb('audit_log', { method: 'POST', body: JSON.stringify({ actor_id: me.id, action, target: clip(target, 200) }) }).catch(() => {});
  try {
    const mine = (await sb(`profiles?id=eq.${encodeURIComponent(me.id)}&select=role`))?.[0];
    if (mine?.role !== 'admin_master') return out(403, { error: 'Somente o admin master.' });

    if (body.action === 'create') {
      const email = clip(body.email, 200).toLowerCase(), role = body.role ?? 'triador';
      const legend = clip(body.legend_number, 10), name = clip(body.full_name, 100);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return out(400, { error: 'E-mail inválido.' });
      if (!ROLES.includes(role)) return out(400, { error: 'Papel inválido. Só existe um admin master.' });
      if (legend && !/^\d{1,10}$/.test(legend)) return out(400, { error: 'O número de Legendário deve ter só dígitos (até 10).' });
      if (body.password !== undefined && !validPassword(body.password)) return out(400, { error: 'A senha provisória deve ter 8+ caracteres, com letra e número.' });
      const password = body.password ?? generatePassword();
      const created = await authAdmin('', { method: 'POST', body: JSON.stringify({ email, password, email_confirm: true }) });
      await sb(`profiles?id=eq.${encodeURIComponent(created.id)}`, { method: 'PATCH', body: JSON.stringify({ role, full_name: name, legend_number: legend, must_change_password: true }) });
      await audit('usuario_criado', email + ' (' + role + ')');
      return out(200, { id: created.id, ...(body.password === undefined ? { tempPassword: password } : {}) });
    }

    const id = clip(body.id, 64);
    const target = id ? (await sb(`profiles?id=eq.${encodeURIComponent(id)}&select=id,role,email`))?.[0] : null;
    if (!target) return out(404, { error: 'Usuário não encontrado.' });

    if (body.action === 'update') {
      const patch = {};
      if (body.full_name !== undefined) patch.full_name = clip(body.full_name, 100);
      if (body.legend_number !== undefined) {
        const l = clip(body.legend_number, 10);
        if (l && !/^\d{1,10}$/.test(l)) return out(400, { error: 'O número de Legendário deve ter só dígitos (até 10).' });
        patch.legend_number = l;
      }
      if (body.role !== undefined) {
        if (!ROLES.includes(body.role)) return out(400, { error: 'Papel inválido. Só existe um admin master.' });
        if (target.id === me.id) return out(400, { error: 'Você é o admin master: o seu papel não pode ser alterado.' });
        patch.role = body.role;
      }
      if (!Object.keys(patch).length) return out(400, { error: 'Nada para alterar.' });
      await sb(`profiles?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
      await audit('usuario_editado', target.email);
      return out(200, { ok: true });
    }
    if (body.action === 'reset-password') {
      if (!validPassword(body.password)) return out(400, { error: 'A senha provisória deve ter 8+ caracteres, com letra e número.' });
      await authAdmin('/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify({ password: body.password }) });
      await sb(`profiles?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ must_change_password: true }) });
      await audit('senha_redefinida', target.email);
      return out(200, { ok: true });
    }
    // delete
    if (target.id === me.id && body.confirm !== 'EXCLUIR MEU USUARIO') return out(400, { error: 'Para apagar o seu próprio usuário, confirme por escrito.' });
    await authAdmin('/' + encodeURIComponent(id), { method: 'DELETE' });
    await audit('usuario_apagado', target.email);
    return out(200, { ok: true });
  } catch {
    return out(500, { error: 'Não foi possível concluir a operação.' });
  }
}
