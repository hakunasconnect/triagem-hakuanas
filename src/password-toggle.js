// Botão "olho" nos campos de senha: mostra ou oculta o que foi digitado.
// Vale para qualquer <input type="password"> da página, inclusive os que aparecem depois (telas redesenhadas e janelas).
// Não guarda nem envia nada, e não usa JavaScript inline (compatível com a CSP do app e do /admin).
const SVG = inner => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`;
const ICON_SHOW = SVG('<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>');
const ICON_HIDE = SVG('<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>');
const CSS = `.pw-wrap{position:relative;display:block;width:100%}
.pw-wrap input{padding-right:52px!important}
.pw-wrap .pw-eye{position:absolute;top:50%;right:2px;transform:translateY(-50%);width:46px;height:46px;min-height:0;margin:0;padding:0;border:0;border-radius:10px;background:transparent;color:inherit;opacity:.7;cursor:pointer;display:flex;align-items:center;justify-content:center}
.pw-wrap .pw-eye:hover,.pw-wrap .pw-eye[aria-pressed="true"]{opacity:1}
.pw-wrap .pw-eye:focus-visible{outline:3px solid currentColor;outline-offset:-3px}`;

function addEye(input) {
  if (input.dataset.eye) return;
  input.dataset.eye = '1';
  const doc = input.ownerDocument;
  const hadFocus = doc.activeElement === input;
  const wrap = doc.createElement('span'); wrap.className = 'pw-wrap';
  const btn = doc.createElement('button');
  btn.type = 'button'; btn.className = 'pw-eye';
  btn.setAttribute('aria-label', 'Mostrar senha'); btn.setAttribute('aria-pressed', 'false'); btn.title = 'Mostrar ou ocultar a senha';
  btn.innerHTML = ICON_SHOW;
  btn.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.setAttribute('aria-pressed', String(show));
    btn.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
    btn.innerHTML = show ? ICON_HIDE : ICON_SHOW;
    try { input.focus({ preventScroll: true }); const n = input.value.length; input.setSelectionRange(n, n); } catch { /* o foco é só conforto */ }
  });
  input.replaceWith(wrap);
  wrap.append(input, btn);
  if (hadFocus) { try { input.focus({ preventScroll: true }); } catch { /* idem */ } }
}

function scan(root) {
  if (root.nodeType !== 1) return;
  if (root.matches?.('input[type="password"]')) addEye(root);
  root.querySelectorAll?.('input[type="password"]').forEach(addEye);
}

export function enableFieldEyes(doc = document) {
  if (!doc.getElementById('pw-eye-style')) {
    const style = doc.createElement('style'); style.id = 'pw-eye-style'; style.textContent = CSS;
    (doc.head || doc.documentElement).append(style);
  }
  scan(doc.documentElement);
  const Observer = doc.defaultView?.MutationObserver;
  if (!Observer || doc.documentElement.dataset.eyeObserver) return;
  doc.documentElement.dataset.eyeObserver = '1';
  new Observer(muts => { for (const m of muts) m.addedNodes.forEach(scan); }).observe(doc.documentElement, { childList: true, subtree: true });
}
