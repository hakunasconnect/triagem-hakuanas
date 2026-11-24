// Painel "Gerenciar usuários". O admin master gerencia todos (e define permissões dos admins);
// um admin gerencia só triadores e coordenadores, e nunca toca no admin master nem em outros admins.
import { PERMISSIONS } from '../users/perms.js';
const ROLE_LABEL = { triador: 'Triador', coordenador: 'Coordenador', admin: 'Admin', admin_master: 'Admin master' };

export function usersPanel({ profiles = [] }, { esc, me }) {
  const master = me?.role === 'admin_master';
  const roles = master ? ['triador', 'coordenador', 'admin'] : ['triador', 'coordenador'];
  const rows = profiles.map(u => {
    const locked = u.role === 'admin_master' ? !master : (u.role === 'admin' && !master && u.id !== me?.id);
    const isMasterRow = u.role === 'admin_master';
    const role = isMasterRow
      ? '<span class="pill">Admin master</span>'
      : locked ? `<span class="pill">${esc(ROLE_LABEL[u.role] || u.role)}</span>`
        : `<select data-role="${esc(u.id)}" aria-label="Papel">${roles.map(r => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}</select>`;
    const perms = master && u.role === 'admin'
      ? `<details class="perms"><summary>Permissões deste admin</summary>${PERMISSIONS.map(([k, label]) => `<label style="font-weight:400"><input type="checkbox" data-perm="${esc(u.id)}" value="${k}" ${u.permissions?.[k] !== false ? 'checked' : ''} style="width:auto"> ${esc(label)}</label>`).join('')}<p style="margin:6px 0"><button data-saveperms="${esc(u.id)}">Salvar permissões</button></p></details>` : '';
    const actions = locked
      ? '<span class="muted">Somente o admin master altera.</span>'
      : `<button data-save="${esc(u.id)}">Salvar</button> <button data-pass="${esc(u.id)}">Nova senha</button> <button data-hist="${esc(u.id)}">Apagar histórico</button> ${(isMasterRow && !master) || (!master && u.id === me?.id) ? '' : `<button data-remove="${esc(u.id)}" data-email="${esc(u.email)}" data-self="${isMasterRow ? '1' : ''}">Apagar usuário</button>`}`;
    const nameCell = locked
      ? `${esc(u.full_name || u.email)}<span class="muted">${esc(u.email)}</span>`
      : `<input data-name="${esc(u.id)}" value="${esc(u.full_name)}" maxlength="100" aria-label="Nome" placeholder="Nome"><span class="muted">${esc(u.email)}</span>${perms}`;
    const legendCell = locked ? esc(u.legend_number) : `<input data-legend="${esc(u.id)}" value="${esc(u.legend_number)}" inputmode="numeric" maxlength="10" aria-label="Número de Legendário" placeholder="Nº" style="max-width:110px">`;
    return `<tr data-user="${esc(u.id)}"><td>${nameCell}</td><td>${legendCell}</td><td>${role}</td><td>${actions}</td></tr>`;
  }).join('');
  return `<section class="card" id="manage-users"><h2>Gerenciar usuários</h2>
  <p class="muted">${master
    ? 'Você é o único admin master: pode criar, editar, trocar a senha e apagar qualquer usuário e o histórico dele, e definir o que cada admin pode fazer. Ninguém mais consegue se tornar admin master.'
    : 'Você pode gerenciar triadores e coordenadores. O admin master e os outros admins só são alterados pelo admin master.'}</p>
  <div class="scroll"><table><thead><tr><th>Nome / e-mail</th><th>Nº Legendário</th><th>Papel</th><th>Ações</th></tr></thead><tbody>${rows}</tbody></table></div>
  <p class="err" id="mu-msg" role="alert"></p>
  <h2 style="margin-top:18px">Novo usuário</h2>
  <form id="mu-form"><label for="mu-email">E-mail</label><input id="mu-email" type="email" required>
  <label for="mu-name">Nome</label><input id="mu-name" maxlength="100">
  <label for="mu-legend">Nº de Legendário</label><input id="mu-legend" inputmode="numeric" maxlength="10">
  <label for="mu-role">Papel</label><select id="mu-role">${roles.map(r => `<option value="${r}">${ROLE_LABEL[r]}</option>`).join('')}</select>
  <label for="mu-pass">Senha provisória (deixe vazio para gerar uma)</label><input id="mu-pass" type="text" autocomplete="off">
  <p class="err" id="mu-new" role="status"></p><button class="primary" type="submit">Criar usuário</button></form></section>`;
}

export function bindUsers({ client, app, refresh }) {
  const $ = s => app.querySelector(s);
  const say = (m, ok = false, id = 'mu-msg') => { const e = $('#' + id); if (e) { e.style.color = ok ? 'var(--ok)' : ''; e.textContent = m; } };
  const call = async body => {
    const r = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + client.accessToken }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Error(j.error || 'Não foi possível concluir.');
    return j;
  };
  const guard = fn => async ev => { try { await fn(ev); } catch (e) { say(e.message); } };
  app.querySelectorAll('[data-save]').forEach(b => { b.onclick = guard(async () => {
    const id = b.dataset.save, role = app.querySelector(`[data-role="${id}"]`);
    await call({ action: 'update', id, full_name: app.querySelector(`[data-name="${id}"]`).value, legend_number: app.querySelector(`[data-legend="${id}"]`).value, ...(role ? { role: role.value } : {}) });
    await refresh(); say('Usuário salvo.', true);
  }); });
  app.querySelectorAll('[data-saveperms]').forEach(b => { b.onclick = guard(async () => {
    const id = b.dataset.saveperms, permissions = {};
    app.querySelectorAll(`[data-perm="${id}"]`).forEach(c => { permissions[c.value] = c.checked; });
    await call({ action: 'set-permissions', id, permissions }); await refresh(); say('Permissões salvas.', true);
  }); });
  app.querySelectorAll('[data-pass]').forEach(b => { b.onclick = guard(async () => {
    const p = prompt('Digite a nova senha provisória (8+ caracteres, com letra e número). A pessoa será obrigada a trocá-la no próximo acesso.'); if (!p) return;
    await call({ action: 'reset-password', id: b.dataset.pass, password: p }); say('Senha provisória definida. Informe-a à pessoa.', true);
  }); });
  app.querySelectorAll('[data-hist]').forEach(b => { b.onclick = guard(async () => {
    if (!confirm('Apagar todo o histórico de uso (sessões e ações) deste usuário? Isso não pode ser desfeito.')) return;
    await client.rest('usage_sessions?user_id=eq.' + encodeURIComponent(b.dataset.hist), { method: 'DELETE' }); await refresh(); say('Histórico apagado.', true);
  }); });
  app.querySelectorAll('[data-remove]').forEach(b => { b.onclick = guard(async () => {
    const self = !!b.dataset.self;
    if (self) { if (prompt('Você vai apagar o SEU usuário de admin master e perderá o acesso ao painel. Para confirmar, digite: EXCLUIR MEU USUARIO') !== 'EXCLUIR MEU USUARIO') return; }
    else if (!confirm('Apagar o usuário ' + b.dataset.email + ' e todo o histórico dele? Isso não pode ser desfeito.')) return;
    await call({ action: 'delete', id: b.dataset.remove, ...(self ? { confirm: 'EXCLUIR MEU USUARIO' } : {}) });
    if (self) { await client.signOut(); location.reload(); return; }
    await refresh(); say('Usuário apagado.', true);
  }); });
  $('#mu-form').onsubmit = guard(async ev => {
    ev.preventDefault(); say('', false, 'mu-new');
    const pass = $('#mu-pass').value.trim();
    const j = await call({ action: 'create', email: $('#mu-email').value.trim(), full_name: $('#mu-name').value, legend_number: $('#mu-legend').value.trim(), role: $('#mu-role').value, ...(pass ? { password: pass } : {}) });
    await refresh();
    say(j.tempPassword ? 'Usuário criado. Senha provisória (mostrada só agora): ' + j.tempPassword : 'Usuário criado com a senha provisória que você definiu.', true, 'mu-new');
  });
}
