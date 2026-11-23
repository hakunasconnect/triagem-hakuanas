// Cliente mínimo da Evolution API (conexão por QR code). Roda só no servidor: a chave nunca vai ao navegador.
const enc = encodeURIComponent;

export function safeQr(v) {
  if (typeof v !== 'string' || !v) return undefined;
  const s = v.startsWith('data:') ? v : 'data:image/png;base64,' + v;
  return /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(s) && s.length < 400000 ? s : undefined;
}

export function createEvolution({ url, key, fetch: f = globalThis.fetch }) {
  const base = String(url || '').replace(/\/+$/, '');
  const req = async (path, init = {}) => {
    const r = await f(base + path, { ...init, headers: { apikey: key, 'Content-Type': 'application/json', ...(init.headers || {}) } });
    const text = await r.text().catch(() => ''); let json = null; try { json = text ? JSON.parse(text) : null; } catch {}
    return { ok: r.ok, status: r.status, json };
  };
  return {
    async state(name) {
      const r = await req('/instance/connectionState/' + enc(name));
      if (r.status === 404) return 'absent';
      if (!r.ok) throw Error('A Evolution respondeu ' + r.status + '.');
      return String(r.json?.instance?.state || r.json?.state || 'close');
    },
    async create(name) {
      const r = await req('/instance/create', { method: 'POST', body: JSON.stringify({ instanceName: name, integration: 'WHATSAPP-BAILEYS', qrcode: true }) });
      if (!r.ok) throw Error('Não foi possível criar a instância (' + r.status + ').');
      return { qr: safeQr(r.json?.qrcode?.base64 || r.json?.base64) };
    },
    async qr(name) {
      const r = await req('/instance/connect/' + enc(name));
      if (!r.ok) throw Error('Não foi possível gerar o QR code (' + r.status + ').');
      return { qr: safeQr(r.json?.base64 || r.json?.qrcode?.base64) };
    },
  };
}
