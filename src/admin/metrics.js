// Métricas de uso de quem opera o app. Não há dado de participante aqui.
const DAY = 86400000, LOCAL_OFFSET = -3 * 3600000; // America/Sao_Paulo (sem horário de verão)
const ms = v => (typeof v === 'string' ? Date.parse(v) : NaN);
const localDay = t => new Date(t + LOCAL_OFFSET).toISOString().slice(0, 10);

export function sessionMs(s) {
  const start = ms(s?.started_at), end = ms(s?.ended_at ?? s?.last_seen_at);
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : 0;
}
export function formatDuration(value) {
  const m = Math.max(0, Math.floor((Number(value) || 0) / 60000));
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
export function ageRange(age) {
  const n = Number(age);
  if (!Number.isInteger(n) || n < 16) return '';
  return n <= 17 ? '16-17' : n <= 29 ? '18-29' : n <= 44 ? '30-44' : n <= 59 ? '45-59' : '60+';
}
export function summarize({ profiles = [], sessions = [], events = [], now = new Date() } = {}) {
  const nowMs = now.getTime(), users = new Map();
  for (const p of profiles) users.set(p.id, { id: p.id, name: p.full_name || '', email: p.email || '', role: p.role || '', legendNumber: p.legend_number || '', sessions: 0, totalMs: 0, avgMs: 0, triages: 0, lastSeen: null });
  const days = [];
  for (let i = 13; i >= 0; i--) days.push({ day: localDay(nowMs - i * DAY), sessions: 0, triages: 0 });
  const byDay = new Map(days.map(d => [d.day, d]));
  const colors = { green: 0, yellow: 0, red: 0, black: 0 };
  for (const s of sessions) {
    const u = users.get(s.user_id); if (!u) continue;
    u.sessions++; u.totalMs += sessionMs(s);
    if (!u.lastSeen || ms(s.last_seen_at) > ms(u.lastSeen)) u.lastSeen = s.last_seen_at;
    const d = byDay.get(localDay(ms(s.started_at))); if (d) d.sessions++;
  }
  for (const e of events) {
    if (e.event_type !== 'triage_done') continue;
    const u = users.get(e.user_id); if (u) u.triages++;
    const c = e.meta?.color; if (c in colors) colors[c]++;
    const d = byDay.get(localDay(ms(e.occurred_at))); if (d) d.triages++;
  }
  const list = [...users.values()];
  for (const u of list) u.avgMs = u.sessions ? Math.round(u.totalMs / u.sessions) : 0;
  list.sort((a, b) => (ms(b.lastSeen) || -Infinity) - (ms(a.lastSeen) || -Infinity));
  return {
    users: list, byDay: days, colors,
    totals: {
      users: list.length, sessions: sessions.length, triages: list.reduce((n, u) => n + u.triages, 0),
      totalMs: list.reduce((n, u) => n + u.totalMs, 0),
      activeUsers7d: list.filter(u => u.lastSeen && nowMs - ms(u.lastSeen) <= 7 * DAY).length,
    },
  };
}
const cell = v => { let s = String(v ?? ''); if (/^[\s]*[=+@\-]/.test(s)) s = "'" + s; return '"' + s.replaceAll('"', '""') + '"'; };
export function usersToCSV(users) {
  const head = ['Nome', 'E-mail', 'Papel', 'Nº Legendário', 'Sessões', 'Tempo total (min)', 'Tempo médio (min)', 'Triagens', 'Último uso'];
  const rows = users.map(u => [u.name, u.email, u.role, u.legendNumber, u.sessions, Math.round(u.totalMs / 60000), Math.round(u.avgMs / 60000), u.triages, u.lastSeen || '']);
  return [head, ...rows].map(r => r.map(cell).join(',')).join('\n');
}
