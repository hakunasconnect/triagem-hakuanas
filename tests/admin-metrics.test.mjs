import{test}from'node:test';import assert from'node:assert/strict';
import{summarize,sessionMs,formatDuration,usersToCSV,ageRange}from'../src/admin/metrics.js';
const now=new Date('2026-11-23T12:00:00Z');
const profiles=[{id:'u1',email:'ana@exemplo.com',full_name:'Ana',legend_number:'123',role:'triador'},{id:'u2',email:'beto@exemplo.com',full_name:'=Beto',legend_number:'',role:'coordenador'},{id:'u3',email:'sem-uso@exemplo.com',full_name:'',legend_number:'',role:'triador'}];
const sessions=[
 {id:'s1',user_id:'u1',started_at:'2026-11-23T10:00:00Z',last_seen_at:'2026-11-23T10:30:00Z',ended_at:null},
 {id:'s2',user_id:'u1',started_at:'2026-11-22T10:00:00Z',last_seen_at:'2026-11-22T11:00:00Z',ended_at:'2026-11-22T10:45:00Z'},
 {id:'s3',user_id:'u2',started_at:'2026-10-01T10:00:00Z',last_seen_at:'2026-10-01T10:10:00Z',ended_at:null}];
const events=[
 {user_id:'u1',event_type:'triage_done',occurred_at:'2026-11-23T10:10:00Z',meta:{color:'red',band:'Alta',age_range:'30-44'}},
 {user_id:'u1',event_type:'triage_done',occurred_at:'2026-11-23T10:20:00Z',meta:{color:'green'}},
 {user_id:'u1',event_type:'export',occurred_at:'2026-11-23T10:25:00Z',meta:{format:'pdf'}},
 {user_id:'u2',event_type:'triage_done',occurred_at:'2026-10-01T10:05:00Z',meta:{color:'yellow'}}];

test('Duração da sessão usa o fim quando existe, senão o último sinal, e nunca é negativa',()=>{assert.equal(sessionMs(sessions[0]),30*60000);assert.equal(sessionMs(sessions[1]),45*60000);assert.equal(sessionMs({started_at:'2026-11-23T10:00:00Z',last_seen_at:'2026-11-23T09:00:00Z',ended_at:null}),0);assert.equal(sessionMs({started_at:'x',last_seen_at:'y'}),0);});
test('Duração é formatada em português curto',()=>{assert.equal(formatDuration(0),'0 min');assert.equal(formatDuration(30*60000),'30 min');assert.equal(formatDuration(75*60000),'1 h 15 min');assert.equal(formatDuration(-5),'0 min');});
test('Resumo soma sessões, tempo, triagens e distribuição de cores por usuário',()=>{const s=summarize({profiles,sessions,events,now});const ana=s.users.find(u=>u.id==='u1');assert.equal(ana.sessions,2);assert.equal(ana.totalMs,75*60000);assert.equal(ana.triages,2);assert.equal(ana.lastSeen,'2026-11-23T10:30:00Z');assert.equal(s.totals.users,3);assert.equal(s.totals.sessions,3);assert.equal(s.totals.triages,3);assert.deepEqual(s.colors,{green:1,yellow:1,red:1,black:0});});
test('Usuário sem uso aparece com zeros e sem data, e o resumo conta só ativos nos últimos 7 dias',()=>{const s=summarize({profiles,sessions,events,now});const nada=s.users.find(u=>u.id==='u3');assert.equal(nada.sessions,0);assert.equal(nada.totalMs,0);assert.equal(nada.lastSeen,null);assert.equal(s.totals.activeUsers7d,1);});
test('Série por dia cobre 14 dias, inclusive os sem uso, em ordem crescente',()=>{const s=summarize({profiles,sessions,events,now});assert.equal(s.byDay.length,14);assert.equal(s.byDay.at(-1).day,'2026-11-23');assert.equal(s.byDay.at(-1).sessions,1);assert.equal(s.byDay.at(-1).triages,2);assert.equal(s.byDay.at(-2).sessions,1);assert.equal(s.byDay[0].sessions,0);});
test('Ordena por último uso, mais recente primeiro, e quem nunca usou por último',()=>{const s=summarize({profiles,sessions,events,now});assert.deepEqual(s.users.map(u=>u.id),['u1','u2','u3']);});
test('Faixa etária só devolve as faixas combinadas',()=>{assert.equal(ageRange(16),'16-17');assert.equal(ageRange(25),'18-29');assert.equal(ageRange(30),'30-44');assert.equal(ageRange(59),'45-59');assert.equal(ageRange(60),'60+');assert.equal(ageRange(NaN),'');assert.equal(ageRange(15),'');});
test('CSV protege contra fórmulas e aspas, e usa cabeçalho em português',()=>{const csv=usersToCSV(summarize({profiles,sessions,events,now}).users);const lines=csv.split('\n');assert.match(lines[0],/^"Nome","E-mail"/);assert.ok(csv.includes('"\'=Beto"'));assert.ok(csv.includes('"ana@exemplo.com"'));assert.equal(lines.length,4);});
test('Entrada vazia ou inválida não quebra o resumo',()=>{const s=summarize({profiles:[],sessions:[],events:[],now});assert.equal(s.totals.users,0);assert.equal(s.byDay.length,14);assert.deepEqual(summarize({now}).users,[]);});
