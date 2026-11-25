// Painel "Pistas": o admin cadastra as pistas (nome, local, TOP) que cada triador escolhe no app para gerar o PRÓPRIO link do formulário.
// Tudo passa pelo servidor (/api/intake), que confere a permissão. Desativar uma pista tira ela da escolha, mas não apaga nem desidentifica
// as fichas já recebidas.
export const loadPistas = async client => (await client.server('/api/intake', { action: 'pista_list' })).pistas || [];

export function pistasPanel({ pistas }, { esc }) {
  if (!pistas) return '<section class="card" id="pistas-box"><h2>Pistas</h2><p class="err" role="alert">Não foi possível carregar as pistas. Confira se a migração 0010 foi aplicada no Supabase e se o site está atualizado.</p></section>';
  const campo = (f, valor, rotulo, extra = '') => `<input data-f="${f}" value="${esc(valor)}" aria-label="${rotulo}" ${extra}>`;
  const linha = p => `<tr data-pista="${esc(p.id)}"><td>${campo('name', p.name, 'Nome da pista', 'maxlength="60"')}</td><td>${campo('place', p.place, 'Local da pista', 'maxlength="100"')}</td><td>${campo('top', p.top, 'TOP da pista', 'maxlength="20" style="max-width:90px"')}</td><td><label style="font-weight:400"><input type="checkbox" data-f="active" ${p.active ? 'checked' : ''}> Ativa</label></td><td><button data-save-pista="${esc(p.id)}">Salvar</button></td></tr>`;
  return `<section class="card" id="pistas-box"><h2>Pistas</h2><p class="muted">Cada triador escolhe uma destas pistas no app (botão “Minha pista”) e recebe o próprio link do formulário; as fichas chegam identificadas com o triador e a pista. Desative uma pista que acabou: ela some da escolha, mas as fichas já recebidas continuam identificadas.</p>
  <div class="scroll"><table><thead><tr><th>Nome</th><th>Local</th><th>TOP</th><th>Situação</th><th></th></tr></thead><tbody>${pistas.map(linha).join('')}
  <tr id="pista-nova"><td>${campo('name', '', 'Nome da nova pista', 'maxlength="60" placeholder="Ex.: Pista 1"')}</td><td>${campo('place', '', 'Local da nova pista', 'maxlength="100" placeholder="Cidade / local"')}</td><td>${campo('top', '', 'TOP da nova pista', 'maxlength="20" placeholder="Nº do TOP" style="max-width:90px"')}</td><td><span class="muted">Nova</span></td><td><button class="primary" id="add-pista">Adicionar</button></td></tr></tbody></table></div>
  <p class="err" id="pista-msg" role="alert"></p></section>`;
}

export function bindPistas({ client, app, refresh }) {
  const msg = t => { const m = app.querySelector('#pista-msg'); if (m) m.textContent = t; };
  const ler = tr => { const v = f => tr.querySelector(`[data-f=${f}]`); return { name: v('name').value, place: v('place').value, top: v('top').value, ...(v('active') ? { active: v('active').checked } : {}) }; };
  const salvar = async corpo => { msg(''); try { await client.server('/api/intake', { action: 'pista_save', ...corpo }); await refresh(); } catch (e) { msg(e.message); } };
  app.querySelectorAll('[data-save-pista]').forEach(b => { b.onclick = () => salvar({ id: b.dataset.savePista, ...ler(b.closest('tr')) }); });
  const add = app.querySelector('#add-pista'); if (add) add.onclick = () => salvar(ler(app.querySelector('#pista-nova')));
}
