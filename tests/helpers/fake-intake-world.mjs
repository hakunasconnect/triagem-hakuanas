// Banco em memória que imita o que o servidor de inscrições usa (PostgREST + login do Supabase). Só para teste.
// Suporta o que o handler realmente pede: filtros eq./in., Prefer ignore-duplicates, unicidade e PATCH.
import { randomUUID } from 'node:crypto';
const J = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
export const FORM_TEMPLATE = 'https://docs.google.com/forms/d/e/FORMULARIO-DE-TESTE/viewform?usp=pp_url&entry.111222333=__CODIGO__';
export const USERS = {
  master: { token: 'tok-master', id: '00000000-0000-0000-0000-00000000000a', role: 'admin_master', full_name: 'Master Teste', legend_number: '1' },
  admin: { token: 'tok-admin', id: '00000000-0000-0000-0000-0000000000a1', role: 'admin', full_name: 'Admin Teste', legend_number: '2', permissions: {} },
  adminSemGestao: { token: 'tok-admin2', id: '00000000-0000-0000-0000-0000000000a2', role: 'admin', full_name: 'Admin Sem Gestão', legend_number: '3', permissions: { manage_users: false } },
  coord: { token: 'tok-coord', id: '00000000-0000-0000-0000-0000000000c1', role: 'coordenador', full_name: 'Coord Teste', legend_number: '4' },
  tri1: { token: 'tok-tri1', id: '00000000-0000-0000-0000-0000000000b1', role: 'triador', full_name: 'Triador Um', legend_number: '111' },
  tri2: { token: 'tok-tri2', id: '00000000-0000-0000-0000-0000000000b2', role: 'triador', full_name: 'Triador Dois', legend_number: '222' },
  tri3: { token: 'tok-tri3', id: '00000000-0000-0000-0000-0000000000b3', role: 'triador', full_name: 'Triador Sem Pista', legend_number: '333' },
};
const UNICO = { pistas: [['name', 'place', 'top']], pista_links: [['code'], ['pista_id', 'triager_id']], form_submissions: [['response_id']] };

export function createWorld(opts = {}) {
  const linkTemplate = 'linkTemplate' in opts ? opts.linkTemplate : FORM_TEMPLATE; // undefined explícito = "não configurado"
  const db = { profiles: Object.values(USERS).map(({ token, ...p }) => ({ permissions: {}, ...p })), pistas: [], pista_links: [], form_submissions: [] };
  const log = []; let falhar = null;
  const teste = (row, [col, spec]) => {
    if (spec.startsWith('eq.')) return String(row[col]) === spec.slice(3);
    if (spec.startsWith('in.(')) return spec.slice(4, -1).split(',').includes(String(row[col]));
    throw Error('filtro não suportado no banco de teste: ' + col + '=' + spec);
  };
  const fetch = async (u, init = {}) => {
    const url = new URL(String(u)), m = init.method || 'GET', body = init.body ? JSON.parse(init.body) : undefined;
    log.push({ m, path: url.pathname + url.search, body, headers: init.headers || {} });
    if (url.pathname === '/auth/v1/user') {
      const tok = String(init.headers?.Authorization || '').replace('Bearer ', ''), u2 = Object.values(USERS).find(x => x.token === tok);
      return u2 ? J(200, { id: u2.id }) : J(401, {});
    }
    const tabela = url.pathname.replace('/rest/v1/', '');
    if (!db[tabela]) throw Error('tabela inesperada ' + tabela);
    if (falhar && falhar.tabela === tabela && falhar.m === m) { const f = falhar; if (!f.sempre) falhar = null; return J(500, { message: 'falha simulada' }); }
    const filtros = [...url.searchParams].filter(([k]) => !['select', 'order', 'limit', 'on_conflict'].includes(k));
    const casa = r => filtros.every(f => teste(r, f));
    if (m === 'GET') return J(200, db[tabela].filter(casa));
    if (m === 'POST') {
      const ignorar = String(init.headers?.Prefer || '').includes('ignore-duplicates'), linha = { id: randomUUID(), ...(tabela === 'form_submissions' ? { status: 'novo' } : {}), ...(tabela === 'pistas' ? { active: true } : {}), ...body };
      for (const cols of UNICO[tabela] || []) if (db[tabela].some(r => cols.every(c => r[c] === linha[c]))) return ignorar ? J(201, []) : J(409, { message: 'duplicado' });
      db[tabela].push(linha); return J(201, [linha]);
    }
    if (m === 'PATCH') { const alvos = db[tabela].filter(casa); alvos.forEach(r => Object.assign(r, body)); return J(200, alvos); }
    throw Error('método inesperado ' + m);
  };
  return {
    db, log, fetch,
    deps: { fetch, supabaseUrl: 'https://x.supabase.co', anonKey: 'ANON', serviceKey: 'SERVICE', intakeSecret: 'segredo-de-teste-123', linkTemplate },
    falharProxima: (tabela, m = 'GET', sempre = false) => { falhar = { tabela, m, sempre }; },
    gravacoes: () => log.filter(c => c.m !== 'GET' && !c.path.includes('/auth/v1')),
  };
}
