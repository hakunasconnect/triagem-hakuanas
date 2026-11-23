// Painel "Alertas por WhatsApp (Evolution)" do admin: conexão, destinatários, teste e histórico.
import { normalizeNumber } from '../alerts/server.js';

export function alertsPanel({ settings: s = {}, recipients: rs = [], alerts: al = [] }, { esc, fmt }) {
  const status = a => {
    const d = Array.isArray(a.delivery) ? a.delivery : [];
    if (!d.length) return '—';
    const ok = d.filter(x => x.ok).length;
    return ok + '/' + d.length + (d[0]?.error && !d[0]?.whatsapp ? ' · ' + esc(d[0].error) : '');
  };
  const recipientRows = rs.map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.whatsapp)}</td><td><input type="checkbox" data-toggle="${esc(r.id)}" ${r.active ? 'checked' : ''} style="width:auto" aria-label="Ativo"></td><td><button data-del="${esc(r.id)}">Remover</button></td></tr>`).join('');
  const alertRows = al.map(a => `<tr><td>${esc(fmt(a.created_at))}</td><td>${esc(a.participant_name)}</td><td><span class="pill">${a.color === 'black' ? 'Preto' : 'Vermelho'}</span></td><td>${esc((a.reasons || []).join('; '))}</td><td class="hide-sm muted">${esc(a.participant_phone)} ${esc(a.participant_email)}</td><td>${status(a)}</td></tr>`).join('');
  return `<section class="card" id="alerts"><h2>Alertas por WhatsApp (Evolution)</h2>
  <p class="muted">Quando uma triagem sai <strong>vermelha ou preta</strong>, os números abaixo recebem nome, motivos, telefone e e-mail. Só você, como admin, vê estes dados.</p>
  <div id="wa-box"><p id="wa-status" role="status">Verificando a conexão do WhatsApp…</p><div id="wa-qr"></div><button class="primary" type="button" id="wa-connect">Conectar WhatsApp (gerar QR code)</button></div>
  <details style="margin-top:14px"><summary>Avançado: informar instância e chave manualmente</summary>
  <form id="evo-form"><label for="evo-url">Endereço da Evolution</label><input id="evo-url" type="url" value="${esc(s.evolution_url || 'https://evo.n8ndredson.com')}" required>
  <label for="evo-inst">Nome da instância</label><input id="evo-inst" value="${esc(s.instance || '')}" placeholder="deixe vazio para criar automaticamente">
  <label for="evo-key">API key da instância</label><input id="evo-key" type="password" autocomplete="off" value="${esc(s.api_key || '')}" placeholder="deixe vazio para usar a chave do servidor">
  <label><input type="checkbox" id="evo-active" ${s.active !== false ? 'checked' : ''} style="width:auto"> Alertas ativos</label>
  <label><input type="checkbox" id="evo-use" ${s.notify_use !== false ? 'checked' : ''} style="width:auto"> Avisar também a cada novo uso do app</label>
  <p class="err" id="evo-msg" role="alert"></p><button class="primary" type="submit">Salvar conexão</button> <button type="button" id="evo-test">Enviar mensagem de teste</button></form></details>
  <p style="margin-top:10px"><button type="button" id="evo-test2">Enviar mensagem de teste</button> <span class="err" id="evo-msg2" role="alert"></span></p>
  <h2 style="margin-top:18px">Quem recebe</h2>
  ${rs.length ? `<div class="scroll"><table><thead><tr><th>Nome</th><th>WhatsApp</th><th>Ativo</th><th></th></tr></thead><tbody>${recipientRows}</tbody></table></div>` : '<p class="muted">Nenhum número cadastrado ainda.</p>'}
  <form id="rec-form" style="margin-top:10px"><label for="rec-name">Nome</label><input id="rec-name" maxlength="100" required>
  <label for="rec-num">WhatsApp com DDI e DDD (ex.: 5511999990000)</label><input id="rec-num" inputmode="numeric" required>
  <p class="err" id="rec-msg" role="alert"></p><button type="submit">Adicionar número</button></form>
  <h2 style="margin-top:18px">Últimos alertas</h2>
  ${al.length ? `<div class="scroll"><table><thead><tr><th>Quando</th><th>Pessoa</th><th>Cor</th><th>Motivos</th><th class="hide-sm">Contato</th><th>Enviado</th></tr></thead><tbody>${alertRows}</tbody></table></div>` : '<p class="muted">Nenhum alerta ainda.</p>'}</section>`;
}

export function bindAlerts({ client, app, refresh }) {
  const $ = s => app.querySelector(s);
  const say = (id, m, ok = false) => { const e = $('#' + id); if (e) { e.style.color = ok ? 'var(--ok)' : ''; e.textContent = m; } };
  $('#evo-form').onsubmit = async ev => {
    ev.preventDefault(); say('evo-msg', '');
    try {
      const url = $('#evo-url').value.trim();
      if (!/^https:\/\/[^ ]+$/.test(url)) throw Error('O endereço deve começar com https://');
      await client.rest('alert_settings?id=eq.true', { method: 'PATCH', body: JSON.stringify({ evolution_url: url, instance: $('#evo-inst').value.trim(), api_key: $('#evo-key').value.trim(), active: $('#evo-active').checked, notify_use: $('#evo-use').checked, updated_at: new Date().toISOString() }) });
      await refresh(); const d = app.querySelector('#alerts details'); if (d) d.open = true; say('evo-msg', 'Conexão salva.', true);
    } catch (e) { say('evo-msg', e.message); }
  };
  const api = async type => {
    const r = await fetch('/api/alert', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + client.accessToken }, body: JSON.stringify({ type }) });
    return r.json();
  };
  const runTest = id => async () => {
    say(id, 'Enviando teste…');
    try {
      const j = await api('test');
      if (j.sent) say(id, 'Teste enviado. Confira o WhatsApp dos números ativos.', true);
      else say(id, 'Não enviou: ' + (j.error || (j.deliveries || []).map(d => d.error).filter(Boolean).join('; ') || 'sem resposta'));
    } catch { say(id, 'Sem conexão com o servidor de alertas.'); }
  };
  $('#evo-test').onclick = runTest('evo-msg'); $('#evo-test2').onclick = runTest('evo-msg2');

  // Conexão do WhatsApp por QR code: a instância é criada sozinha; a pessoa só escaneia.
  const status = $('#wa-status'), qrBox = $('#wa-qr'), btn = $('#wa-connect');
  const show = (m, ok = false) => { status.textContent = m; status.style.color = ok ? 'var(--ok)' : ''; };
  const STATES = { open: ['✅ WhatsApp conectado. Os alertas já podem ser enviados.', true], close: ['WhatsApp ainda não conectado.'], absent: ['WhatsApp ainda não conectado.'], connecting: ['Aguardando a leitura do QR code…'], unconfigured: ['A chave da Evolution ainda não foi configurada no servidor.'] };
  const paint = j => { const [m, ok] = STATES[j.state] || [j.error || 'Não foi possível verificar a conexão agora.']; show(j.error && !STATES[j.state] ? j.error : m, !!ok); btn.hidden = j.state === 'open'; if (j.state === 'open') qrBox.innerHTML = ''; };
  let polling = null;
  const stop = () => { if (polling) { clearInterval(polling); polling = null; } };
  const drawQr = qr => { qrBox.innerHTML = ''; if (!qr) return; const img = document.createElement('img'); img.src = qr; img.alt = 'QR code para conectar o WhatsApp'; img.width = 260; img.height = 260; img.style.cssText = 'background:#fff;padding:8px;border-radius:8px;display:block;margin:10px 0'; const p = document.createElement('p'); p.className = 'muted'; p.textContent = 'No celular: WhatsApp → Aparelhos conectados → Conectar um aparelho → aponte a câmera para este código.'; qrBox.append(img, p); };
  api('wa-status').then(paint).catch(() => show('Não foi possível verificar a conexão agora.'));
  btn.onclick = async () => {
    stop(); btn.disabled = true; show('Gerando o QR code…');
    try {
      const j = await api('wa-connect'); paint(j); drawQr(j.qr);
      if (j.state === 'open' || j.state === 'unconfigured' || j.state === 'error') return;
      let ticks = 0;
      polling = setInterval(async () => {
        ticks++;
        if (!status.isConnected || ticks > 60) return stop();
        try {
          const s = await api('wa-status');
          if (s.state === 'open') { stop(); paint(s); await refresh(); return; }
          if (ticks % 8 === 0) { const n = await api('wa-connect'); if (n.qr) drawQr(n.qr); }
        } catch {}
      }, 3000);
    } catch { show('Sem conexão com o servidor de alertas.'); }
    finally { btn.disabled = false; }
  };
  $('#rec-form').onsubmit = async ev => {
    ev.preventDefault(); say('rec-msg', '');
    const number = normalizeNumber($('#rec-num').value);
    if (!number) { say('rec-msg', 'Número inválido. Use DDI + DDD + número (10 a 15 dígitos).'); return; }
    try { await client.rest('alert_recipients', { method: 'POST', body: JSON.stringify({ name: $('#rec-name').value.trim(), whatsapp: number, active: true }) }); await refresh(); }
    catch { say('rec-msg', 'Não foi possível adicionar (número já cadastrado?).'); }
  };
  app.querySelectorAll('[data-toggle]').forEach(c => { c.onchange = async () => { try { await client.rest('alert_recipients?id=eq.' + encodeURIComponent(c.dataset.toggle), { method: 'PATCH', body: JSON.stringify({ active: c.checked }) }); } catch { c.checked = !c.checked; } }; });
  app.querySelectorAll('[data-del]').forEach(b => { b.onclick = async () => { if (!confirm('Remover este número?')) return; try { await client.rest('alert_recipients?id=eq.' + encodeURIComponent(b.dataset.del), { method: 'DELETE' }); await refresh(); } catch {} }; });
}
