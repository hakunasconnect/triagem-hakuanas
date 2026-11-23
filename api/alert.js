import { handleAlert } from '../src/alerts/handler.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../src/admin/config.js';

export default async function handler(req, res) {
  // A autenticação é por token no cabeçalho (sem cookies), então liberar a origem não expõe nada.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const r = await handleAlert(
    { method: req.method, authorization: req.headers.authorization, body },
    { fetch, supabaseUrl: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY, evolutionKey: process.env.EVOLUTION_API_KEY },
  );
  res.status(r.status).json(r.json);
}
