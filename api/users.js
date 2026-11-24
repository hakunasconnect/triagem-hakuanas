import { handleUsers } from '../src/users/handler.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../src/admin/config.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const r = await handleUsers(
    { method: req.method, authorization: req.headers.authorization, body },
    { fetch, supabaseUrl: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY },
  );
  res.status(r.status).json(r.json);
}
