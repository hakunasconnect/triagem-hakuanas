import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
// Contrato do cabeçalho no celular (≤740px): todos os controles visíveis e alinhados em grade, sem rolagem horizontal escondida
// e sem a coluna estreita à direita (max-width:190px) das versões antigas.
const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const blocks=[...css.matchAll(/@media\(max-width:740px\)\{/g)].map(m=>{let i=m.index+m[0].length,d=1;while(d&&i<css.length){if(css[i]==='{')d++;else if(css[i]==='}')d--;i++;}return css.slice(m.index,i);});
const mobile=blocks.join('\n');
test('cabeçalho móvel usa grade alinhada, sem rolagem horizontal oculta',()=>{
  assert.match(mobile,/\.topbar\{[^}]*display:grid/,'topbar em grade');
  assert.match(mobile,/\.topbar \.actions\{[^}]*display:contents/,'ações participam da grade do cabeçalho');
  assert.doesNotMatch(mobile,/\.topbar \.actions\{[^}]*overflow-x:auto/,'sem carrossel horizontal escondido');
  assert.doesNotMatch(mobile,/max-width:190px/,'sem coluna estreita à direita');
});
test('cabeçalho móvel mantém barra fixa e botões com alvo de toque ≥ 38px',()=>{
  assert.match(mobile,/\.topbar\{[^}]*position:sticky/);
  assert.match(mobile,/min-height:38px/);
});
test('links Spotify e tênis continuam acessíveis por texto mesmo compactos no celular',()=>{
  assert.match(mobile,/\.spotify-link span[^{]*\{[^}]*clip/,'texto visualmente oculto, não removido');
});
test('cabeçalho enxuto: ajuda de celular e download offline ficam em Configurações, não na barra fixa',()=>{
  const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  const i=app.indexOf('<header class="topbar">'),j=app.indexOf('</header>',i);
  const header=app.slice(i,j);
  assert.ok(i>0&&j>i);
  assert.doesNotMatch(header,/id="mobile-help"/);
  assert.doesNotMatch(header,/download-link/);
  assert.match(header,/id="print-report"/);assert.match(header,/id="open-report-export"/);
  assert.match(header,/id="spotify-praise"/);assert.match(header,/id="shoe-link"/);
  const panel=app.slice(app.indexOf('function mobileAccessPanel'),app.indexOf('function configuration'));
  assert.match(panel,/id="mobile-help"/);assert.match(panel,/download-link/);
  assert.match(app,/savePreferencesPanel\(savePreferences\)\+mobileAccessPanel\(\)/,'painel renderizado na aba Configurações');
});
