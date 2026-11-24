import { novoContexto, foto, marcar, limpar, rolarDialog, rolarAte, cadastrar, salvarFicha, fim, nota, DIR, INSCRICOES } from './lib.mjs';
import { writeFile } from 'node:fs/promises';

const { page, erros } = await novoContexto();
page.on('dialog', d => { nota('  (confirm nativo: ' + d.message().slice(0, 90) + ')'); d.dismiss(); });
const aba = id => page.locator(`button[data-tab="${id}"]`).first().click().then(() => page.waitForTimeout(350));
const fechar = async () => { if (await page.locator('dialog[open]').count()) { const b = page.locator('#close-modal'); if (await b.count()) await b.first().click(); else await page.keyboard.press('Escape'); await page.waitForTimeout(250); } };
const dumpDlg = async (n) => writeFile(new URL('t-' + n + '.txt', DIR), await page.locator('dialog[open]').first().innerText());
const passo = async (nome, fn) => { try { await fn(); } catch (e) { nota('FALHOU ' + nome + ': ' + String(e.message).split('\n')[0]); await fechar().catch(() => {}); } };

// 1. visão geral
await passo('visao-geral', () => foto(page, '01-visao-geral', { alvo: 'pagina', marks: [['nav.nav', 1], ['#import', 2], ['#import-forms', 3], ['#new', 4], ['#print-report', 5, {fixo:true}], ['#open-report-export', 6, {fixo:true}]] }));

// 2. configurações: identificação do TOP e conta
await passo('config', async () => {
  await page.setViewportSize({ width: 1280, height: 1500 });
  await aba('settings');
  await page.locator('#top-number').fill('1845');
  await page.getByPlaceholder('Cidade / local do TOP').fill('Local de exemplo');
  await page.getByPlaceholder('Nome da base').fill('Base Exemplo');
  await page.getByPlaceholder('Quem está fazendo a triagem').fill('Triador Exemplo');
  await page.getByPlaceholder('Somente números').fill('123456');
  await foto(page, '02-config-top', { secao: 'section:has(#top-number)', marks: [['#top-number', 1], [page.getByPlaceholder('Cidade / local do TOP'), 2], [page.getByPlaceholder('Nome da base'), 3], [page.getByPlaceholder('Quem está fazendo a triagem'), 4], [page.getByPlaceholder('Somente números'), 5], ['#save-header', 6, {fixo:true}]] });
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.locator('#save-header').click(); await page.waitForTimeout(400);
  await foto(page, '03-conta-triador', { secao: 'section:has(#account-form)', marks: [['#account-form input[name="email"]', 1], ['#account-form input[type="password"]', 2], ['#account-form input[type="checkbox"]', 3], ['#account-form button[type="submit"]', 4]] });
  await foto(page, '04-celular-offline', { secao: 'section:has(#mobile-help)', marks: [['#mobile-help', 1], ['a:has-text("Baixar HTML offline")', 2]] });
  await page.locator('#mobile-help').click(); await page.waitForTimeout(400); await dumpDlg('mobile-help'); await foto(page, '05-abrir-celular', {}); await fechar();
  await aba('people');
  await foto(page, '06-cabecalho-top', { alvo: 'pagina', clip: { x: 240, y: 60, width: 1040, height: 300 } });
});

// 3. a ficha
await passo('ficha', async () => {
  const m = await cadastrar(page, { name: 'Maria Exemplo', phone: '(11) 97777-6666', age: '41', state: 'SP', weight: '68', height: '165', blood: 'O+', pressure: '120/80', pulse: '72', spo2: '97' });
  await rolarDialog(page, 0);
  await foto(page, '10-ficha-identificacao', { marks: [['[name="name"]', 1], ['[name="phone"]', 2], ['[name="age"]', 3], ['[name="weight"]', 4], ['[name="height"]', 5]] });
  await page.locator('[name="pressure"]').evaluate(e => e.scrollIntoView({ block: 'center' }));
  await foto(page, '10b-ficha-sinais', { marks: [['[name="pressure"]', 1], ['[name="pulse"]', 2], ['[name="spo2"]', 3], ['[name="notes"]', 4]] });
  await rolarAte(page, 'Histórico médico'); await m.locator('input[name="flag"][value="htn"]').check();
  await foto(page, '11-ficha-historico', { marks: [['input[name="flag"][value="htn"]', 1], ['input[name="reviewed"][value="history"]', 2]] });
  await rolarAte(page, 'Critérios de exclusão');
  await foto(page, '12-ficha-exclusoes', { marks: [['input[name="flag"][value="surgery"]', 1], ['input[name="reviewed"][value="exclusions"]', 2]] });
  await rolarAte(page, 'Preparação e revisão');
  await m.locator('select[name="activity"]').selectOption({ label: '3 ou mais vezes / semana' }); await m.locator('select[name="walk"]').selectOption({ label: 'Sim' });
  await m.locator('select[name="tetanus"]').selectOption({ label: 'Sim' }); await m.locator('select[name="prior"]').selectOption({ label: 'Sim' });
  await m.locator('input[name="reviewer"]').fill('Dr. Exemplo CRM 0000');
  await foto(page, '13-ficha-preparo', { marks: [['select[name="activity"]', 1], ['select[name="walk"]', 2], ['select[name="tetanus"]', 3], ['select[name="prior"]', 4], ['input[name="reviewer"]', 5], ['input[name="certificate"]', 6]] });
  await rolarDialog(page, 'fim');
  await foto(page, '14-ficha-resultado', { marks: [[page.locator('dialog[open]').getByText(/Faixa interna|Parcial —/).first(), 1], [page.locator('dialog[open]').getByText(/Score interno/).first(), 2], [page.locator('dialog[open]').getByText(/Atenção operacional provisória/).first(), 3], ['dialog[open] details', 4], ['#print-record', 5, {fixo:true}], [page.locator('dialog[open]').getByRole('button', { name: 'Salvar avaliação' }), 6, {fixo:true}]] });
  await fechar();
});

// 4. casos de resultado
const caso = async (arq, dados, flags, destaque) => passo(arq, async () => {
  const m = await cadastrar(page, dados, flags, { completo: true }); await rolarDialog(page, 'fim');
  await foto(page, arq, { alvo: 'dialog[open] .result', marks: [[page.locator('dialog[open]').getByText(/Atenção operacional provisória/).first(), 1], ...(destaque ? [[page.locator('dialog[open]').getByText(destaque).first(), 2]] : [])] }); await fechar();
});
const B = { name: 'Fulano Exemplo', age: '45', weight: '80', height: '178' };
await caso('20-caso-verde', B, [], null);
await caso('21-caso-vermelho', B, ['htn', 'bpmed'], null);
await caso('22-caso-preto', { ...B, age: '63' }, ['disease'], null);
await caso('23-caso-exclusao', B, ['surgery'], /Critérios de exclusão — revisão obrigatória/);
await caso('24-caso-menor', { ...B, age: '17', weight: '60', height: '170' }, [], /Pendências/);
await caso('25-caso-implante', B, ['implant'], /Pendências/);
await caso('26-caso-amarelo', { ...B, weight: '102' }, [], null);

// 5. lista com participantes
await passo('lista', async () => {
  await cadastrar(page, { name: 'Ana Exemplo', age: '35', weight: '62', height: '165' }); await salvarFicha(page);
  await cadastrar(page, { name: 'Bruno Exemplo', age: '48', weight: '88', height: '175', phone: '(11) 96666-5555' }, ['htn', 'bpmed']); await salvarFicha(page);
  await cadastrar(page, { name: 'Carlos Exemplo', age: '63', weight: '80', height: '170' }, ['disease']); await salvarFicha(page);
  await cadastrar(page, { name: 'Diego Exemplo', age: '30', weight: '75', height: '180' }, ['surgery']); await salvarFicha(page);
  await cadastrar(page, { name: 'Elisa Exemplo', age: '17', weight: '55', height: '160' }); await salvarFicha(page);
  await cadastrar(page, { name: 'Maria Exemplo', phone: '(11) 97777-6666', age: '41', state: 'SP', weight: '68', height: '165', blood: 'O+', pressure: '120/80', pulse: '72', spo2: '97' }, [], { completo: true }); await salvarFicha(page);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
  await foto(page, '30-lista', { secao: 'section:has(#search)', marks: [['#search', 1], ['#filter', 2], ['#color-filter', 3], ['#list-order', 4], ['#clear-list-filters', 5], [page.getByText('Abrir ficha').first(), 6]] });
  await page.locator('#color-filter').selectOption({ label: 'Vermelho' }); await page.waitForTimeout(300);
  await foto(page, '31-lista-vermelho', { secao: 'section:has(#search)', marks: [['#color-filter', 1]] });
  await page.locator('#clear-list-filters').click(); await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0, 300)); await page.waitForTimeout(300);
  { const bs = []; for (const t of ['Pessoas cadastradas nesta sessão', 'Alertas ou critérios de exclusão']) bs.push(await page.getByText(t).locator('xpath=..').boundingBox()); const clip = { x: bs[0].x - 14, y: bs[0].y - 14, width: bs[1].x + bs[1].width - bs[0].x + 28, height: bs[0].height + 28 };
    await foto(page, '32-painel', { alvo: 'pagina', clip, marks: [[page.getByText('Pessoas cadastradas nesta sessão').locator('xpath=..'), 1], [page.getByText('Aguardando revisão completa').locator('xpath=..'), 2], [page.getByText('Com documentação conferida').locator('xpath=..'), 3], [page.getByText('Alertas ou critérios de exclusão').locator('xpath=..'), 4]] }); }
  await writeFile(new URL('t-lista-final.txt', DIR), await page.locator('main').innerText());
});

// 6. importar
await passo('importar', async () => {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('#import').click(); await page.waitForTimeout(400);
  await foto(page, '40-importar-1', { marks: [['#use-ocr', 1], ['#import-file', 2]] });
  await page.locator('#import-file').setInputFiles(new URL('./lista-ficticia.csv', import.meta.url).pathname.slice(1)); await page.waitForTimeout(1800);
  await foto(page, '41-importar-2', { marks: [['#auto-mode', 1], ['#manual-mode', 2]] });
  await rolarDialog(page, 'fim');
  await foto(page, '42-importar-3', { marks: [['#confirm-source-review', 1], ['#confirm-import', 2]] });
  await fechar();
});

// 7. calculadoras e critérios
await passo('calc', async () => {
  await aba('calc');
  const ins = page.locator('main input'); await ins.nth(0).fill('35'); await ins.nth(1).fill('80'); await ins.nth(2).fill('178');
  await page.getByRole('button', { name: 'Calcular' }).first().click(); await page.waitForTimeout(400);
  await foto(page, '50-calculadoras', { secao: 'section:has(select)', marks: [[ins.nth(0), 1], [ins.nth(1), 2], [ins.nth(2), 3], [page.getByRole('button', { name: 'Calcular' }).first(), 4]] });
  await writeFile(new URL('t-calc.txt', DIR), await page.locator('main').innerText());
});
await passo('criterios', async () => { await page.setViewportSize({ width: 1280, height: 1250 }); await aba('book'); await foto(page, '51-criterios', { secao: 'section:has(h2)' }); await page.setViewportSize({ width: 1280, height: 860 }); });

// 8. arquivos e segurança, backup, relatórios
await passo('shield', async () => {
  await page.setViewportSize({ width: 1280, height: 1000 }); await aba('shield'); await foto(page, '60-arquivos', { alvo: 'pagina', marks: [['#security-backup', 1], ['#restore', 2], ['#clear', 3, {fixo:true}]] });
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.locator('#restore').click(); await page.waitForTimeout(400); if (await page.locator('dialog[open]').count()) { await dumpDlg('restaurar'); await foto(page, '61-restaurar', {}); await fechar(); }
  await page.locator('#clear').click(); await page.waitForTimeout(400); if (await page.locator('dialog[open]').count()) { await dumpDlg('apagar'); await foto(page, '62-apagar', {}); await fechar(); }
});
await passo('backup', async () => {
  await aba('people'); await page.locator('#backup').click(); await page.waitForTimeout(400);
  await page.locator('#password').fill('senha-de-exemplo-123'); await page.locator('#password-confirm').fill('senha-de-exemplo-123');
  await foto(page, '63-backup', { marks: [['#password', 1], ['#password-confirm', 2], [page.getByRole('button', { name: 'Salvar arquivo .LGND' }), 3, {fixo:true}]] }); await fechar();
});
await passo('relatorios', async () => {
  await page.setViewportSize({ width: 1280, height: 1500 });
  await page.locator('#reports').click(); await page.waitForTimeout(500);
  await foto(page, '64-relatorios', { marks: [['#report-print', 1], ['#report-preview', 2], ['#report-format', 3], ['#report-destination', 4], ['#report-readable-consent', 5], ['#report-complete', 6], ['#report-missing', 7, {fixo:true}]] }); await fechar();
  await page.setViewportSize({ width: 1280, height: 860 });
});

// 9. login e formulário (rede simulada, conta fictícia)
await passo('login', async () => {
  await aba('settings');
  await page.locator('#account-form input[name="email"]').fill('triador@exemplo.com'); await page.locator('#account-form input[type="password"]').fill('Senha-Exemplo-123'); await page.locator('#account-form input[type="checkbox"]').check();
  await page.locator('#account-form button[type="submit"]').click(); await page.waitForSelector('text=Conectado como', { timeout: 8000 });
  await foto(page, '70-conta-conectada', { secao: 'section:has(#send-summary)', marks: [['#send-summary', 1], ['#account-out', 2]] });
  await aba('people'); await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('#import-forms').click(); await page.waitForSelector('[data-form-id]', { timeout: 8000 });
  await dumpDlg('formulario');
  await foto(page, '71-formulario', { marks: [[page.locator('[data-form-id]').first(), 1], ['#forms-all', 2], ['#forms-confirm', 3], ['#forms-import', 4]] }); await fechar();
});
nota('erros de JavaScript: ' + JSON.stringify(erros));
await fim();
