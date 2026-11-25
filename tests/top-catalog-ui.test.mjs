import {test} from 'node:test';import assert from 'node:assert/strict';import {openOffline,until} from './helpers/offline-dom.mjs';
import {TOP_CATALOG} from '../src/generated-top-catalog.js';
// Tela "Configurações → Identificação do TOP": escolher um TOP do calendário preenche local, nome da operação e a logomarca da Track.
// O preparo real da imagem (JPEG -> PNG) usa o canvas do navegador e é provado no Chromium (tests/browser-top-catalog.mjs);
// aqui o canvas é simulado para provar a ligação da tela, os avisos e o que NÃO pode ser tocado.
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAARzQklUCAgICHwIZIgAAAALSURBVAiZY2AAAgAABQABYlUyiAAAAABJRU5ErkJggg==';
const bento=TOP_CATALOG.find(e=>e.place==='Bento Gonçalves, RS'),legacy=TOP_CATALOG.find(e=>e.number==='1827'),laMission=TOP_CATALOG.find(e=>e.name==='Track La Mission');
async function abrir({falhaNaImagem=false}={}){
  const app=await openOffline(),w=app.w;w.File=File;w.createImageBitmap=async()=>{if(falhaNaImagem)throw Error('imagem ilegível');return{width:100,height:100,close(){}};};
  w.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){}});w.HTMLCanvasElement.prototype.toDataURL=()=>PNG;
  app.$('[data-tab=settings]').click();
  app.escolher=async(id)=>{const sel=app.$('#top-catalog');sel.value=id;sel.dispatchEvent(new w.Event('change'));await until(()=>/^(Preenchido com|)/.test(app.$('#catalog-status').textContent)&&(app.$('#catalog-status').textContent!==''||app.$('#header-error').textContent!==''),'resposta da escolha');await until(()=>!app.$('#save-header').disabled,'botão salvar liberado');};
  app.campo=n=>app.$('#settings-form [name='+n+']').value;
  return app;
}

test('a lista traz todos os TOPs em 3 grupos e a opção vazia não muda nada',async()=>{
  const app=await abrir();try{const sel=app.$('#top-catalog');assert.ok(sel);assert.equal(sel.options.length,TOP_CATALOG.length+1);
    assert.deepEqual([...sel.querySelectorAll('optgroup')].map(g=>g.label),['Brasil — calendário oficial','Outros países — calendário oficial','Informados por você, não confirmados']);
    const antes=['location','event','topNumber'].map(app.campo);sel.value='';sel.dispatchEvent(new app.w.Event('change'));assert.deepEqual(['location','event','topNumber'].map(app.campo),antes);assert.equal(app.$('#catalog-status').textContent,'');
  }finally{app.close();}
});

test('TOP do calendário: preenche local e nome, põe a logomarca no lado da base (fundo escuro), avisa que falta o número e não toca no triador',async()=>{
  const app=await abrir();try{
    app.$('#settings-form [name=triager]').value='Dra. Ana Exemplo';app.$('#settings-form [name=legendNumber]').value='123456';
    await app.escolher(bento.id);
    assert.equal(app.campo('location'),'Bento Gonçalves, RS');assert.equal(app.campo('event'),'Track Vale dos Vinhedos');assert.equal(app.campo('topNumber'),'','o calendário não traz número: não inventa');assert.equal(app.campo('baseLogoBackground'),'dark');
    assert.equal(app.campo('triager'),'Dra. Ana Exemplo');assert.equal(app.campo('legendNumber'),'123456','nome e nº de Legendário do triador ficam como estão');
    const img=app.$('#header-preview .event-logo-left img');assert.ok(img,'a logomarca aparece na prévia do cabeçalho');assert.ok(img.src.startsWith('data:image/png;base64,'),'a logo vira PNG pelo caminho de validação do app');
    const st=app.$('#catalog-status').textContent;assert.ok(st.startsWith('Preenchido com: 26/11/2026 · Track Vale dos Vinhedos'));assert.ok(st.includes('Falta digitar o número do TOP'));assert.ok(!st.includes('não foi confirmado'));
    assert.equal(app.$('#header-error').textContent,'');assert.deepEqual(app.errors,[]);
    // salvar aplica de verdade na sessão
    app.campo=n=>app.$('#settings-form [name='+n+']').value;app.$('#settings-form [name=topNumber]').value='1845';app.$('#settings-form').dispatchEvent(new app.w.Event('submit',{cancelable:true}));
    app.$('[data-tab=people]').click();app.$('[data-tab=settings]').click();assert.equal(app.campo('location'),'Bento Gonçalves, RS');assert.equal(app.campo('topNumber'),'1845');assert.equal(app.campo('event'),'Track Vale dos Vinhedos');assert.ok(app.$('#header-preview .event-logo-left img'),'logo guardada com a identificação');
  }finally{app.close();}
});

test('TOP informado e não confirmado: traz o número e o local, avisa para conferir e MANTÉM a logo anterior (não há logo para ele)',async()=>{
  const app=await abrir();try{
    await app.escolher(bento.id);assert.ok(app.$('#header-preview .event-logo-left img'));
    await app.escolher(legacy.id);
    assert.equal(app.campo('topNumber'),'1827');assert.equal(app.campo('location'),'Vitória / Serra, ES');assert.equal(app.campo('event'),'Track Legacy');
    const st=app.$('#catalog-status').textContent;assert.ok(st.includes('não foi confirmado'));assert.ok(st.includes('logo anterior foi mantida'));assert.ok(!st.includes('Falta digitar o número'));
    assert.ok(app.$('#header-preview .event-logo-left img'),'a logo anterior continua na prévia');
  }finally{app.close();}
});

test('TOP sem local nem número (La Mission): preenche só o que existe e deixa os campos vazios, sem inventar',async()=>{
  const app=await abrir();try{app.$('#settings-form [name=topNumber]').value='';await app.escolher(laMission.id);
    assert.equal(app.campo('event'),'Track La Mission');assert.equal(app.campo('location'),'');assert.equal(app.campo('topNumber'),'');assert.ok(app.$('#catalog-status').textContent.includes('não foi confirmado'));
  }finally{app.close();}
});

test('o número do TOP que você já digitou não é apagado quando o TOP escolhido não traz número; quando traz, o número do catálogo vale',async()=>{
  const app=await abrir();try{app.$('#settings-form [name=topNumber]').value='1845';
    await app.escolher(bento.id);assert.equal(app.campo('topNumber'),'1845','o calendário oficial não traz número: o seu fica');assert.ok(!app.$('#catalog-status').textContent.includes('Falta digitar'));
    await app.escolher(legacy.id);assert.equal(app.campo('topNumber'),'1827','quando o catálogo informa o número, ele é aplicado (e o aviso diz o que foi preenchido)');assert.ok(app.$('#catalog-status').textContent.includes('TOP 1827'));
  }finally{app.close();}
});

test('se a imagem não puder ser preparada, mostra o motivo, mantém o resto preenchido e libera o botão de salvar',async()=>{
  const app=await abrir({falhaNaImagem:true});try{await app.escolher(bento.id);
    assert.ok(app.$('#header-error').textContent.includes('Não foi possível preparar a logomarca'));assert.ok(app.$('#header-error').textContent.includes('imagem ilegível'));assert.ok(app.$('#header-error').textContent.includes('logo anterior foi mantida'));
    assert.equal(app.campo('location'),'Bento Gonçalves, RS');assert.equal(app.campo('event'),'Track Vale dos Vinhedos');assert.equal(app.$('#save-header').disabled,false);assert.equal(app.$('#header-preview .event-logo-left img'),null,'sem logo nova nem anterior, nada é inventado');
  }finally{app.close();}
});
