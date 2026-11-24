import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { enableFieldEyes } from '../src/password-toggle.js';

const page = html => { const dom = new JSDOM(`<!doctype html><html><head></head><body>${html}</body></html>`); return { dom, doc: dom.window.document }; };
const tick = () => new Promise(r => setTimeout(r, 0));
const FORM = '<form id="f"><label for="p">Senha</label><input id="p" name="password" type="password" autocomplete="current-password"><input id="t" name="nome" type="text"><input id="c" type="checkbox"></form>';

test('Campo de senha ganha o botão do olho, que começa oculto e acessível', () => {
  const { doc } = page(FORM); enableFieldEyes(doc);
  const input = doc.getElementById('p'), btn = doc.querySelector('.pw-eye');
  assert.ok(btn, 'deveria existir o botão do olho');
  assert.equal(btn.type, 'button', 'não pode enviar o formulário');
  assert.equal(btn.getAttribute('aria-label'), 'Mostrar senha');
  assert.equal(btn.getAttribute('aria-pressed'), 'false');
  assert.equal(input.type, 'password');
  assert.equal(input.parentElement, btn.parentElement, 'botão e campo ficam juntos');
});

test('Clicar no olho mostra a senha digitada e clicar de novo oculta, sem perder o valor', () => {
  const { doc } = page(FORM); enableFieldEyes(doc);
  const input = doc.getElementById('p'), btn = doc.querySelector('.pw-eye');
  input.value = 'Minha-Senha-123!';
  btn.click();
  assert.equal(input.type, 'text'); assert.equal(input.value, 'Minha-Senha-123!');
  assert.equal(btn.getAttribute('aria-label'), 'Ocultar senha'); assert.equal(btn.getAttribute('aria-pressed'), 'true');
  btn.click();
  assert.equal(input.type, 'password'); assert.equal(input.value, 'Minha-Senha-123!');
  assert.equal(btn.getAttribute('aria-label'), 'Mostrar senha'); assert.equal(btn.getAttribute('aria-pressed'), 'false');
});

test('O olho não envia o formulário e o campo continua no formulário', () => {
  const { dom, doc } = page(FORM); enableFieldEyes(doc);
  let submits = 0; doc.getElementById('f').addEventListener('submit', e => { e.preventDefault(); submits++; });
  doc.getElementById('p').value = 'abc';
  doc.querySelector('.pw-eye').click();
  assert.equal(submits, 0);
  assert.equal(new dom.window.FormData(doc.getElementById('f')).get('password'), 'abc');
});

test('Só campos de senha recebem o olho', () => {
  const { doc } = page(FORM); enableFieldEyes(doc);
  assert.equal(doc.querySelectorAll('.pw-eye').length, 1);
  assert.equal(doc.getElementById('t').parentElement.id, 'f');
  assert.equal(doc.getElementById('c').parentElement.id, 'f');
});

test('Campos de senha que aparecem depois (telas redesenhadas e janelas) também ganham o olho, sem duplicar', async () => {
  const { doc } = page('<div id="app"></div>'); enableFieldEyes(doc);
  doc.getElementById('app').innerHTML = '<form><label>Nova<input type="password" id="n"></label><label>Repita<input type="password" id="r"></label></form>';
  await tick();
  assert.equal(doc.querySelectorAll('.pw-eye').length, 2);
  enableFieldEyes(doc); await tick();
  assert.equal(doc.querySelectorAll('.pw-eye').length, 2, 'não duplica ao ligar de novo');
  doc.getElementById('app').innerHTML = '<input type="password" id="x">'; await tick();
  assert.equal(doc.querySelectorAll('.pw-eye').length, 1);
});

test('Um campo de senha dentro de <label> continua dentro dela e o estilo é injetado uma única vez', () => {
  const { doc } = page('<label>Senha<input type="password" id="p"></label>'); enableFieldEyes(doc); enableFieldEyes(doc);
  assert.equal(doc.getElementById('p').closest('label').tagName, 'LABEL');
  assert.equal(doc.querySelectorAll('style#pw-eye-style').length, 1);
});
