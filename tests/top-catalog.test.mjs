import {test} from 'node:test';import assert from 'node:assert/strict';
import {TOP_CATALOG,TOP_CATALOG_META} from '../src/generated-top-catalog.js';
import {catalogLabel,catalogGroups,catalogToForm,findCatalogEntry} from '../src/top-catalog.js';
// Catálogo de TOPs (pedido do responsável, 25/11/2026): ao escolher um TOP o app preenche local, nome e a logomarca da Track.
// Regra de ouro: nada inventado. O site oficial só traz as próximas semanas e NÃO traz o número do TOP; os itens de 2027 foram informados
// pelo responsável e não foram confirmados em fonte pública, então aparecem marcados assim.
const site=TOP_CATALOG.filter(e=>e.source==='site oficial'),informados=TOP_CATALOG.filter(e=>e.source!=='site oficial');
const DATA=/^\d{4}-\d{2}-\d{2}$/;

test('formato: campos obrigatórios, ids únicos, datas e número no formato que o cabeçalho aceita',()=>{
  assert.ok(TOP_CATALOG.length>=40,'catálogo pequeno demais: '+TOP_CATALOG.length);assert.ok(DATA.test(TOP_CATALOG_META.coletadoEm));assert.ok(TOP_CATALOG_META.fonte.startsWith('https://www.loslegendarios.org/'));
  assert.equal(new Set(TOP_CATALOG.map(e=>e.id)).size,TOP_CATALOG.length,'ids repetidos');
  for(const e of TOP_CATALOG){for(const k of['id','date','dateEnd','name','number','place','country','localSite','correcao','logo','source','confirmed','nota'])assert.ok(k in e,e.id+' sem '+k);
    assert.ok(e.date===''||DATA.test(e.date),e.id+' data inválida');assert.ok(e.dateEnd===''||DATA.test(e.dateEnd),e.id);assert.ok(e.number===''||/^\d{1,8}$/.test(e.number),e.id+' número inválido');assert.equal(typeof e.confirmed,'boolean');
    assert.ok(e.logo===''||/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(e.logo),e.id+' logo fora do formato');assert.ok(e.logo.length<40000,e.id+' logo grande demais ('+e.logo.length+')');}
  assert.ok(JSON.stringify(TOP_CATALOG).length<700000,'catálogo pesado demais para o app: '+JSON.stringify(TOP_CATALOG).length);
});

test('origem separada: o que veio do site é confirmado e traz a data; o que o responsável informou fica marcado como NÃO confirmado e sem logomarca',()=>{
  assert.ok(site.length>=40);for(const e of site){assert.equal(e.confirmed,true);assert.ok(DATA.test(e.date),e.id);assert.ok(e.localSite,e.id+' sem o texto original do site');assert.equal(e.number,'','o site não informa o número do TOP: não inventar');}
  assert.equal(informados.length,4);for(const e of informados){assert.equal(e.confirmed,false);assert.equal(e.logo,'');assert.equal(e.localSite,'');assert.ok(e.nota,e.id+' sem observação');}
});

test('os TOPs de 2027 informados pelo responsável estão exatos, com número, datas e local do jeito que ele passou',()=>{
  const por=n=>informados.find(e=>e.number===n);
  const a=por('1827');assert.deepEqual([a.name,a.date,a.dateEnd,a.place,a.country],['Track Legacy','2027-02-25','2027-02-28','Vitória / Serra, ES','Brasil']);
  const b=por('1996');assert.deepEqual([b.name,b.date,b.dateEnd,b.place,b.country],['Legendários Contagem','2027-03-04','2027-03-07','Contagem, MG','Brasil']);
  const m=informados.find(e=>e.name==='Track La Mission');assert.ok(m);assert.equal(m.date,'');assert.equal(m.place,'');assert.equal(m.number,'');
  const j=informados.find(e=>e.date==='2027-01-28');assert.ok(j);assert.equal(j.dateEnd,'2027-01-31');assert.equal(j.place,'');assert.equal(j.number,'');
});

test('sem repetição e com nome: o mesmo TOP não aparece duas vezes e todo TOP do Brasil tem nome e logomarca',()=>{
  const chaves=site.map(e=>[e.date,e.place,e.name].join('|'));assert.equal(new Set(chaves).size,chaves.length,'TOPs repetidos');
  const br=site.filter(e=>e.country==='Brasil');assert.ok(br.length>=30);for(const e of br){assert.ok(e.name.length>2,e.id+' sem nome');assert.ok(e.logo.startsWith('data:image/jpeg;base64,'),e.id+' sem logomarca');}
});

test('locais corrigidos: acentos, nomes e UFs errados no site (conferidos), guardando o texto original ao lado',()=>{
  const lugares=new Set(site.map(e=>e.place));
  for(const certo of['Nova Andradina, MS','Parauapebas, PA','Santo Ângelo, RS','Novo Hamburgo, RS','São Luís, MA','Belém, PA','Brasília, DF','Goiânia, GO','São Paulo, SP'])assert.ok(lugares.has(certo),'faltou '+certo);
  for(const errado of['Nova Andradina, MT','Parauapebas, TO','Santo angelo, MT','Santo angelo, RS','Nova Hamburgo, RS','São Luiz do Maranhão, MA','Belem, PA','Brasilia, DF','Goiania, GO','Sao Paulo, SP','Domenic Republic, Domenic Republic, República Dominicana'])assert.ok(!lugares.has(errado),'ainda tem o erro do site: '+errado);
  const nova=site.find(e=>e.place==='Nova Andradina, MS');assert.equal(nova.localSite,'Nova Andradina, MT, Brasil');assert.match(nova.correcao,/UF/);
  assert.ok(site.every(e=>!e.correcao||e.localSite),'toda correção guarda o original');
  assert.ok(site.every(e=>!/, Brasil$/.test(e.place)),'no Brasil o país é implícito');
});

test('ordenado por data, com os sem data por último',()=>{
  const datas=TOP_CATALOG.map(e=>e.date||'9999-12-31');assert.deepEqual(datas,[...datas].sort());assert.equal(TOP_CATALOG.at(-1).date===''||TOP_CATALOG.at(-1).date>='2027-01-01',true);
});

test('rótulo da lista mostra data, nome, número, local e avisa quando NÃO é confirmado',()=>{
  const x=informados.find(e=>e.number==='1827');assert.equal(catalogLabel(x),'25/02/2027 a 28/02/2027 · Track Legacy · TOP 1827 · Vitória / Serra, ES · não confirmado');
  const s=site.find(e=>e.place==='Bento Gonçalves, RS');assert.ok(catalogLabel(s).startsWith('26/11/2026 · Track Vale dos Vinhedos · Bento Gonçalves, RS'));assert.ok(!catalogLabel(s).includes('não confirmado'));
  const m=informados.find(e=>e.name==='Track La Mission');assert.equal(catalogLabel(m),'data a confirmar · Track La Mission · local a confirmar · não confirmado');
});

test('grupos da lista: Brasil e outros países (calendário oficial) separados dos informados, sem perder nenhum TOP',()=>{
  const g=catalogGroups(TOP_CATALOG);assert.deepEqual(g.map(x=>x.label),['Brasil — calendário oficial','Outros países — calendário oficial','Informados por você, não confirmados']);
  assert.equal(g.reduce((n,x)=>n+x.items.length,0),TOP_CATALOG.length);assert.ok(g[0].items.every(e=>e.confirmed&&e.country==='Brasil'));assert.ok(g[1].items.every(e=>e.confirmed&&e.country!=='Brasil'));assert.ok(g[2].items.every(e=>!e.confirmed));
});

test('ao escolher: preenche local, nome e logomarca; o número só entra quando existe; nunca devolve dado inventado',()=>{
  const s=site.find(e=>e.place==='Bento Gonçalves, RS'),f=catalogToForm(s);assert.deepEqual(f,{location:'Bento Gonçalves, RS',event:'Track Vale dos Vinhedos',topNumber:'',logo:s.logo,logoBackground:'dark'});assert.ok(f.logo);
  const x=catalogToForm(informados.find(e=>e.number==='1827'));assert.deepEqual(x,{location:'Vitória / Serra, ES',event:'Track Legacy',topNumber:'1827',logo:'',logoBackground:''});
  const m=catalogToForm(informados.find(e=>e.name==='Track La Mission'));assert.equal(m.location,'');assert.equal(m.topNumber,'');
  assert.equal(findCatalogEntry(s.id),s);assert.equal(findCatalogEntry('nao-existe'),null);assert.equal(findCatalogEntry(''),null);
});
