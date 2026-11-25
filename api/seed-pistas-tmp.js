// TEMPORÁRIA: cadastra uma única vez as pistas (Tracks do calendário oficial) e é removida logo depois. Protegida por segredo aleatório (SEED_PISTAS_SECRET).
// Sem o segredo certo responde 404, como se a rota não existisse. Só insere a lista fixa do catálogo e devolve contagens (nenhum dado de participante).
import { createHash, timingSafeEqual } from 'node:crypto';
import { TOP_CATALOG } from '../src/generated-top-catalog.js';
import { SUPABASE_URL } from '../src/admin/config.js';

const sha = s => createHash('sha256').update(String(s ?? '')).digest();
const igual = (a, b) => timingSafeEqual(sha(a), sha(b));

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const querido = process.env.SEED_PISTAS_SECRET, dado = req.headers['x-seed-secret'];
  if (req.method !== 'POST' || !querido || !dado || !igual(dado, querido)) return res.status(404).json({ error: 'não encontrado' });
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!chave) return res.status(500).json({ error: 'sem chave de serviço' });
  // Só as Tracks do calendário oficial que têm nome (a lista de 2027 informada pelo responsável não entra: não é confirmada).
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()); // AAAA-MM-DD de hoje em Brasília
  const vistos = new Set(), linhas = [];
  for (const e of TOP_CATALOG) {
    if (!e.confirmed || !e.name || !e.place || !e.date || e.date < hoje) continue; // só TOPs de hoje em diante
    const k = [e.name, e.place].join('|'); if (vistos.has(k)) continue; vistos.add(k);
    linhas.push({ name: e.name, place: e.place, top: '', active: true });
  }
  const h = { apikey: chave, Authorization: 'Bearer ' + chave, 'Content-Type': 'application/json' };
  try {
    const r1 = await fetch(`${SUPABASE_URL}/rest/v1/pistas?on_conflict=name,place,top`, { method: 'POST', headers: { ...h, Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(linhas) });
    if (!r1.ok) return res.status(502).json({ error: 'banco recusou', status: r1.status });
    const r2 = await fetch(`${SUPABASE_URL}/rest/v1/pistas?select=id`, { headers: { ...h, Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' } });
    const total = Number(/\/(\d+)$/.exec(r2.headers.get('content-range') || '')?.[1] ?? NaN);
    return res.status(200).json({ ok: true, enviadas: linhas.length, totalNoBanco: total });
  } catch { return res.status(500).json({ error: 'falha ao falar com o banco' }); }
}
