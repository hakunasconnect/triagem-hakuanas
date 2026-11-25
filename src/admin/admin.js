import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { createAdminClient } from './api.js';
import { summarize, formatDuration, usersToCSV } from './metrics.js';
import { alertsPanel, bindAlerts } from './alerts-panel.js';
import { usersPanel, bindUsers } from './users-panel.js';
import { loadPistas, pistasPanel, bindPistas } from './pistas-panel.js';
import { can as canDo } from '../users/perms.js';
import { enableFieldEyes } from '../password-toggle.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = s => document.querySelector(s);
const app = $('#app');
let store; try { store = window.sessionStorage; } catch { store = undefined; }
const client = createAdminClient({ url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, storage: store });
const fmt = iso => iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—';
const LABELS = { login: 'Entrou', screen_view: 'Abriu uma tela', triage_done: 'Concluiu uma triagem', import: 'Importou arquivo', export: 'Exportou relatório', settings_change: 'Alterou configuração', logout: 'Saiu' };
const COLOR_NAMES = { green: 'Verde', yellow: 'Amarelo', red: 'Vermelho', black: 'Preto' };
const COLOR_CSS = { green: 'var(--ok)', yellow: 'var(--warn)', red: 'var(--bad)', black: 'var(--black)' };
let profile = null, data = null, selected = null;

function loginView(message = '') {
  app.innerHTML = `<form class="card narrow" id="f" autocomplete="on"><h1>Admin — Triagem Hakunas</h1><p class="muted">Acesso restrito.</p>
  <label for="e">E-mail</label><input id="e" type="email" autocomplete="username" required>
  <label for="p">Senha</label><input id="p" type="password" autocomplete="current-password" required>
  <p class="err" role="alert" id="m">${esc(message)}</p><button class="primary" type="submit">Entrar</button></form>`;
  $('#f').onsubmit = async ev => {
    ev.preventDefault(); $('#m').textContent = '';
    try { await client.signIn($('#e').value.trim(), $('#p').value); await start(); }
    catch (e) { $('#m').textContent = e.message; }
  };
}

function passwordView(forced) {
  app.innerHTML = `<form class="card narrow" id="f"><h1>${forced ? 'Defina uma nova senha' : 'Alterar senha'}</h1>
  <p class="muted">${forced ? 'Sua senha atual é provisória. Escolha uma nova para continuar.' : 'Escolha uma senha nova.'} Mínimo de 10 caracteres, com letra, número e símbolo.</p>
  <label for="n">Nova senha</label><input id="n" type="password" autocomplete="new-password" required>
  <label for="c">Repita a nova senha</label><input id="c" type="password" autocomplete="new-password" required>
  <p class="err" role="alert" id="m"></p><button class="primary" type="submit">Salvar senha</button>
  ${forced ? '' : '<button type="button" id="back">Cancelar</button>'}</form>`;
  if (!forced) $('#back').onclick = dashboard;
  $('#f').onsubmit = async ev => {
    ev.preventDefault();
    if ($('#n').value !== $('#c').value) { $('#m').textContent = 'As duas senhas não são iguais.'; return; }
    try { await client.changePassword($('#n').value); profile.must_change_password = false; await dashboard(); }
    catch (e) { $('#m').textContent = e.message; }
  };
}

async function start() {
  const rows = await client.rest('profiles?id=eq.' + client.user.id + '&select=*');
  profile = rows?.[0];
  if (!profile || !['admin_master', 'admin'].includes(profile.role)) { await client.signOut(); loginView('Este acesso é restrito aos administradores.'); return; }
  if (profile.must_change_password) return passwordView(true);
  await dashboard();
}

async function load() {
  const [profiles, sessions, events, settings, recipients, alerts] = await Promise.all([
    client.rest('profiles?select=*'),
    client.rest('usage_sessions?select=*&order=started_at.desc&limit=5000'),
    client.rest('usage_events?select=*&order=occurred_at.desc&limit=5000'),
    client.rest('alert_settings?select=*'),
    client.rest('alert_recipients?select=*&order=created_at.asc'),
    client.rest('alerts?select=*&order=created_at.desc&limit=50'),
  ]);
  // As pistas vêm do servidor; se falharem (ex.: migração 0010 ainda não aplicada) só o painel de pistas avisa, o resto do admin abre normalmente.
  const pistas = can('manage_users') ? await loadPistas(client).catch(() => null) : undefined;
  data = { settings: settings?.[0] || {}, recipients: recipients || [], alerts: alerts || [], pistas, profiles, sessions, events, summary: summarize({ profiles, sessions, events, now: new Date() }) };
}

function colorsBar(c) {
  const total = Object.values(c).reduce((a, b) => a + b, 0);
  if (!total) return '<p class="muted">Nenhuma triagem concluída registrada ainda.</p>';
  return `<div class="colors" role="img" aria-label="Distribuição das cores">${Object.keys(c).map(k => c[k] ? `<div style="width:${c[k] / total * 100}%;background:${COLOR_CSS[k]}"></div>` : '').join('')}</div>
  <div class="legend">${Object.keys(c).map(k => `<span><i class="dot" style="background:${COLOR_CSS[k]}"></i>${COLOR_NAMES[k]}: ${c[k]}</span>`).join('')}</div>`;
}
function daysChart(days) {
  const max = Math.max(1, ...days.map(d => Math.max(d.sessions, d.triages)));
  return `<div class="bars" role="img" aria-label="Sessões e triagens por dia">${days.map(d => `<div class="bar" style="height:${d.sessions / max * 100}%" title="${esc(d.day)}: ${d.sessions} sessões"></div><div class="bar t" style="height:${d.triages / max * 100}%" title="${esc(d.day)}: ${d.triages} triagens"></div>`).join('')}</div>
  <div class="days">${days.map(d => `<span>${esc(d.day.slice(8))}</span>`).join('')}</div>
  <div class="legend"><span><i class="dot" style="background:var(--brand)"></i>Sessões</span><span><i class="dot" style="background:var(--accent)"></i>Triagens</span></div>`;
}
function detail() {
  if (!selected) return '';
  const u = data.summary.users.find(x => x.id === selected); if (!u) return '';
  const evs = data.events.filter(e => e.user_id === selected).slice(0, 50);
  const metaText = m => Object.entries(m || {}).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(' · ');
  return `<section class="card" aria-live="polite"><h2>${esc(u.name || u.email)}</h2><p class="muted">${esc(u.email)} · ${esc(u.role)}${u.legendNumber ? ' · Legendário nº ' + esc(u.legendNumber) : ''}</p>
  <p>${u.sessions} sessões · ${formatDuration(u.totalMs)} no total · média ${formatDuration(u.avgMs)} · ${u.triages} triagens · último uso ${fmt(u.lastSeen)}</p>
  <h2>Últimas ações</h2>${evs.length ? `<div class="scroll"><table><thead><tr><th>Quando</th><th>O que fez</th><th>Detalhe</th></tr></thead><tbody>${evs.map(e => `<tr><td>${fmt(e.occurred_at)}</td><td>${esc(LABELS[e.event_type] || e.event_type)}</td><td class="muted">${metaText(e.meta)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Sem ações registradas.</p>'}</section>`;
}

// No celular as tabelas viram cartões: cada célula recebe o nome da coluna.
function labelTables(root) {
  root.querySelectorAll('table').forEach(t => {
    const heads = [...t.querySelectorAll('thead th')].map(h => h.textContent.trim());
    t.querySelectorAll('tbody tr').forEach(tr => [...tr.children].forEach((td, i) => { if (heads[i]) td.setAttribute('data-label', heads[i]); }));
  });
}
const can = p => canDo(profile, p);
async function dashboard() {
  app.innerHTML = '<p class="muted">Carregando métricas…</p>';
  try { await load(); } catch (e) { app.innerHTML = `<p class="err" role="alert">${esc(e.message)}</p><button id="o">Sair</button>`; $('#o').onclick = logout; return; }
  const s = data.summary, t = s.totals;
  // Atalhos: as seções de usuários e alertas ficam no fim da página; no celular são várias telas de rolagem.
  const jump = [can('manage_users') && ['manage-users', 'Usuários'], can('manage_users') && ['pistas-box', 'Pistas'],(can('manage_whatsapp') || can('view_alerts')) && ['alerts', can('manage_whatsapp') ? 'Alertas e WhatsApp' : 'Alertas'], can('manage_recipients') && ['rec-box', 'Quem recebe'], can('view_alerts') && ['hist-box', 'Últimos alertas']].filter(Boolean);
  app.innerHTML = `<header class="top"><h1>Admin — Triagem Hakunas</h1><div><button id="csv">Exportar CSV</button> <button id="pw">Alterar senha</button> <button id="refresh">Atualizar</button> <button id="out">Sair</button></div></header>
  ${jump.length ? `<nav class="jump" aria-label="Ir para"><span>Ir para:</span>${jump.map(([id, label]) => `<a href="#${id}">${esc(label)}</a>`).join('')}</nav>` : ''}
  <div id="metrics"><div class="kpis"><div class="kpi"><b>${t.users}</b><span>Usuários</span></div><div class="kpi"><b>${t.activeUsers7d}</b><span>Ativos em 7 dias</span></div><div class="kpi"><b>${t.sessions}</b><span>Sessões</span></div><div class="kpi"><b>${esc(formatDuration(t.totalMs))}</b><span>Tempo de uso</span></div><div class="kpi"><b>${t.triages}</b><span>Triagens concluídas</span></div></div>
  <section class="card"><h2>Últimos 14 dias</h2>${daysChart(s.byDay)}</section>
  <section class="card"><h2>Resultado das triagens (cores)</h2>${colorsBar(s.colors)}<p class="muted">Contagens anônimas: o painel não guarda nome nem dado de saúde de participantes.</p></section>
  <section class="card"><h2>Usuários</h2><div class="scroll"><table><thead><tr><th>Usuário</th><th class="hide-sm">Papel</th><th>Sessões</th><th>Tempo</th><th>Triagens</th><th>Último uso</th></tr></thead><tbody>${s.users.map(u => `<tr class="click" tabindex="0" data-id="${esc(u.id)}"><td>${esc(u.name || u.email)}<br><span class="muted">${esc(u.email)}</span></td><td class="hide-sm"><span class="pill">${esc(u.role)}</span></td><td>${u.sessions}</td><td>${esc(formatDuration(u.totalMs))}</td><td>${u.triages}</td><td>${esc(fmt(u.lastSeen))}</td></tr>`).join('')}</tbody></table></div><p class="muted">Toque em um usuário para ver como e quando usou.</p></section>
  </div><div id="detail">${detail()}</div>${can('manage_users') ? usersPanel(data, { esc, me: profile }) + pistasPanel(data, { esc }) : ''}${alertsPanel(data, { esc, fmt, can })}`;
  labelTables(app);
  if (can('manage_users')) { bindUsers({ client, app, refresh: dashboard }); bindPistas({ client, app, refresh: dashboard }); }
  bindAlerts({ client, app, refresh: dashboard, can });
  if (!can('view_metrics')) app.querySelectorAll('#metrics, #detail').forEach(e => e.remove());
  $('#out').onclick = logout; $('#pw').onclick = () => passwordView(false); $('#refresh').onclick = dashboard;
  $('#csv').onclick = () => {
    const blob = new Blob(['﻿' + usersToCSV(s.users)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'uso-triagem-hakunas.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const pick = tr => { selected = tr.dataset.id; $('#detail').innerHTML = detail(); labelTables($('#detail')); $('#detail').scrollIntoView?.({ behavior: 'smooth' }); };
  app.querySelectorAll('tr.click').forEach(tr => { tr.onclick = () => pick(tr); tr.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(tr); } }; });
}
async function logout() { await client.signOut(); profile = data = selected = null; loginView(); }

if (typeof document !== 'undefined') enableFieldEyes(); // botão "olho" em todo campo de senha, inclusive os das telas redesenhadas
// Se o painel falhar ao abrir, a mensagem aparece na tela (antes voltava calado ao login e parecia que "a tela não abre").
(async () => { if (client.signedIn) { try { await start(); return; } catch (e) { loginView('Não foi possível abrir o painel: ' + (e?.message || 'erro desconhecido')); return; } } loginView(); })();
