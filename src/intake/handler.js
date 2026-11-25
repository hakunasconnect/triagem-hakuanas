// Endpoint /api/intake (testável, sem depender da Vercel). Dois usos, separados pelo cabeçalho:
//  1) o formulário Google envia a inscrição com o segredo (x-intake-secret) -> grava no banco com a chave de serviço;
//  2) o app, com o login do triador (Bearer), lista as inscrições novas, marca as importadas e gerencia as PISTAS.
//
// PISTAS (pedido do responsável, 25/11/2026): cada ficha tem de ser atribuída COM EXATIDÃO ao triador e à pista de origem.
//  - o admin cadastra as pistas (nome, local, TOP); o triador escolhe a dele e o servidor emite um CÓDIGO único (triador + pista);
//  - o link do formulário do triador já leva esse código; quando a ficha chega, o servidor CONFERE o código no banco;
//  - código ausente, inexistente ou alterado => a ficha NÃO é atribuída a ninguém ("sem identificação"); nunca no chute;
//  - se a conferência falhar (banco fora do ar), a ficha NÃO é gravada: o envio falha e o script do Google avisa e pode reenviar;
//  - o triador só enxerga/importa fichas da própria pista; coordenador, admin e admin master enxergam todas.
import { createHash, timingSafeEqual, randomInt } from 'node:crypto';
import { normalizeSubmission } from './normalize.js';
import { can } from '../users/perms.js';

const out = (status, json) => ({ status, json });
const sha = s => createHash('sha256').update(String(s ?? '')).digest();
const sameSecret = (a, b) => timingSafeEqual(sha(a), sha(b));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEAM = ['admin_master', 'admin', 'coordenador', 'triador'];
const MAX_BODY = 120000;
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sem I, L, O, 0 e 1: não se confundem ao ler ou digitar
const CODIGO = /^[A-HJKMNP-Z2-9]{10}$/;
const novoCodigo = () => Array.from({ length: 10 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');
const limpa = v => String(v ?? '').replace(/\s+/g, ' ').trim();
const enc = encodeURIComponent;
const linkValido = t => typeof t === 'string' && /^https:\/\/docs\.google\.com\/forms\//.test(t) && t.includes('__CODIGO__');

export async function handleIntake({ method, secret, authorization, body } = {}, { fetch: f, supabaseUrl, anonKey, serviceKey, intakeSecret, linkTemplate } = {}) {
  if (method !== 'POST') return out(405, { error: 'Método não permitido.' });
  if (!body || typeof body !== 'object') return out(400, { error: 'Pedido inválido.' });
  if (JSON.stringify(body).length > MAX_BODY) return out(413, { error: 'Pedido grande demais.' });

  const svc = { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' };
  const sb = async (path, init = {}) => {
    const r = await f(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers: { ...svc, Prefer: 'return=representation', ...(init.headers || {}) } });
    if (!r.ok) throw Error('banco ' + r.status);
    const t = await r.text(); return t ? JSON.parse(t) : null;
  };

  // 1) Formulário Google -> servidor
  if (secret !== undefined || !authorization) {
    if (!intakeSecret) return out(503, { error: 'Recebimento de inscrições não configurado no servidor.' });
    if (!secret || !sameSecret(secret, intakeSecret)) return out(401, { error: 'Não autorizado.' });
    if (body.test === true) return out(200, { ok: true, test: true });
    let s;
    try { s = normalizeSubmission(body); } catch (e) { return out(400, { error: e.message }); }
    try {
      // Confere o código da pista ANTES de gravar. Se não der para conferir (erro), cai no catch: nada é gravado.
      let linkId = null;
      if (CODIGO.test(s.pistaCode)) linkId = (await sb(`pista_links?code=eq.${s.pistaCode}&select=id`))?.[0]?.id ?? null;
      const rows = await sb('form_submissions?on_conflict=response_id', {
        method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
        // Só envia as colunas da pista quando a ficha trouxe um código (assim o formulário antigo, sem o campo, segue funcionando).
        body: JSON.stringify({ response_id: s.responseId, top: s.top, received_at: s.submittedAt, participant_name: s.name, record: s.record, answers: s.answers, ...(s.pistaCode ? { pista_code: s.pistaCode, pista_link_id: linkId } : {}) }),
      });
      return Array.isArray(rows) && rows.length ? out(200, { saved: true }) : out(200, { saved: false, duplicate: true });
    } catch { return out(500, { error: 'Não foi possível gravar a inscrição.' }); }
  }

  // 2) App -> servidor (login do triador)
  const token = /^Bearer (.+)$/.exec(authorization || '')?.[1];
  if (!token) return out(401, { error: 'Entre com sua conta.' });
  const who = await f(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: 'Bearer ' + token } }).catch(() => null);
  if (!who?.ok) return out(401, { error: 'Sessão inválida. Entre novamente.' });
  const me = await who.json();
  try {
    const profile = (await sb(`profiles?id=eq.${enc(me.id)}&select=role,permissions,full_name,legend_number`))?.[0];
    if (!TEAM.includes(profile?.role)) return out(403, { error: 'Sem permissão.' });
    const vêTudo = profile.role !== 'triador'; // triador: só a própria pista
    const meusLinks = async () => (await sb(`pista_links?triager_id=eq.${enc(me.id)}&select=id,code,pista_id`)) || [];
    const escopoDoTriador = async () => { const ids = (await meusLinks()).map(l => l.id); return ids.length ? `&pista_link_id=in.(${ids.join(',')})` : null; };
    const pistaOut = p => ({ id: p.id, name: p.name, place: p.place || '', top: p.top || '', active: p.active !== false });

    if (body.action === 'list') {
      const filter = body.includeImported === true ? '' : '&status=eq.novo';
      let escopo = '';
      if (!vêTudo) { escopo = await escopoDoTriador(); if (escopo === null) return out(200, { items: [] }); }
      const rows = (await sb(`form_submissions?select=id,received_at,top,participant_name,status,record,pista_link_id,pista_code${filter}${escopo}&order=received_at.asc&limit=500`)) || [];
      // quem é o triador e qual a pista de cada ficha atribuída
      const info = new Map(), linkIds = [...new Set(rows.map(r => r.pista_link_id).filter(Boolean))];
      if (linkIds.length) {
        const links = (await sb(`pista_links?id=in.(${linkIds.join(',')})&select=id,pista_id,triager_id`)) || [];
        const pistas = new Map(((await sb(`pistas?id=in.(${[...new Set(links.map(l => l.pista_id))].join(',')})&select=id,name,place,top`)) || []).map(p => [p.id, p]));
        const pessoas = new Map(((await sb(`profiles?id=in.(${[...new Set(links.map(l => l.triager_id))].join(',')})&select=id,full_name,legend_number`)) || []).map(p => [p.id, p]));
        for (const l of links) { const p = pistas.get(l.pista_id) || {}, t = pessoas.get(l.triager_id) || {}; info.set(l.id, { name: p.name || '', place: p.place || '', top: p.top || '', triager: t.full_name || '', legend: t.legend_number || '' }); }
      }
      return out(200, { items: rows.map(i => ({ id: i.id, receivedAt: i.received_at, top: i.top, name: i.participant_name, status: i.status, record: i.record, pista: info.get(i.pista_link_id) || null, pistaCode: i.pista_code || '' })) });
    }
    if (body.action === 'mark') {
      const ids = Array.isArray(body.ids) ? body.ids : [];
      if (!ids.length || ids.length > 500 || !ids.every(id => typeof id === 'string' && UUID.test(id))) return out(400, { error: 'Ids inválidos.' });
      let escopo = '';
      if (!vêTudo) { escopo = await escopoDoTriador(); if (escopo === null) return out(200, { marked: 0 }); }
      const rows = await sb(`form_submissions?id=in.(${ids.join(',')})${escopo}`, { method: 'PATCH', body: JSON.stringify({ status: 'importado', imported_by: me.id, imported_at: new Date().toISOString() }) });
      return out(200, { marked: Array.isArray(rows) ? rows.length : 0 });
    }

    if (body.action === 'pista_list') {
      const pistas = (await sb('pistas?select=id,name,place,top,active&order=name.asc')) || [];
      return out(200, { pistas: pistas.map(pistaOut), mine: (await meusLinks()).map(l => ({ pistaId: l.pista_id, code: l.code })), canManage: can(profile, 'manage_users') });
    }
    if (body.action === 'pista_save') {
      if (!can(profile, 'manage_users')) return out(403, { error: 'Sem permissão para cadastrar pistas.' });
      const name = limpa(body.name), place = limpa(body.place), top = limpa(body.top);
      if (!name) return out(400, { error: 'Informe o nome da pista.' });
      if (name.length > 60 || place.length > 100 || top.length > 20) return out(400, { error: 'Nome (até 60), local (até 100) ou TOP (até 20) grande demais.' });
      if (body.id !== undefined && !(typeof body.id === 'string' && UUID.test(body.id))) return out(400, { error: 'Pista inválida.' });
      const igual = (await sb(`pistas?name=eq.${enc(name)}&place=eq.${enc(place)}&top=eq.${enc(top)}&select=id`)) || [];
      if (igual.some(p => p.id !== body.id)) return out(409, { error: 'Já existe uma pista com este nome, local e TOP.' });
      const ativo = typeof body.active === 'boolean' ? { active: body.active } : {};
      if (body.id) {
        const rows = await sb(`pistas?id=eq.${body.id}`, { method: 'PATCH', body: JSON.stringify({ name, place, top, ...ativo }) });
        return rows?.length ? out(200, { pista: pistaOut(rows[0]) }) : out(404, { error: 'Pista não encontrada.' });
      }
      const rows = await sb('pistas', { method: 'POST', body: JSON.stringify({ name, place, top, ...ativo }) });
      return out(200, { pista: pistaOut(rows[0]) });
    }
    if (body.action === 'pista_claim') {
      if (!(typeof body.pistaId === 'string' && UUID.test(body.pistaId))) return out(400, { error: 'Pista inválida.' });
      const pista = (await sb(`pistas?id=eq.${body.pistaId}&select=id,name,place,top,active`))?.[0];
      if (!pista) return out(404, { error: 'Pista não encontrada.' });
      if (pista.active === false) return out(400, { error: 'Esta pista está desativada.' });
      const buscar = async () => (await sb(`pista_links?pista_id=eq.${pista.id}&triager_id=eq.${enc(me.id)}&select=id,code`))?.[0];
      let link = await buscar();
      if (!link) { // ignore-duplicates: se dois pedidos chegarem juntos, os dois acabam com o MESMO código
        await sb('pista_links?on_conflict=pista_id,triager_id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify({ code: novoCodigo(), pista_id: pista.id, triager_id: me.id }) });
        link = await buscar();
      }
      if (!link) return out(500, { error: 'Não foi possível gerar o código da pista.' });
      const configurado = linkValido(linkTemplate);
      return out(200, { code: link.code, link: configurado ? linkTemplate.split('__CODIGO__').join(link.code) : null, linkConfigured: configurado, pista: pistaOut(pista), triager: { name: profile.full_name || '', legend: profile.legend_number || '' } });
    }
    return out(400, { error: 'Ação inválida.' });
  } catch { return out(500, { error: 'Não foi possível concluir a operação.' }); }
}
