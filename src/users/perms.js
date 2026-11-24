// Permissões do papel "admin" (abaixo do admin master). Padrão: tudo liberado; o admin master liga/desliga.
// Só entra aqui o que o admin pode receber. O que é do admin master fica em MASTER_ONLY e nunca é concedido.
export const PERMISSIONS = [
  ['view_metrics', 'Ver as métricas de uso'],
  ['view_alerts', 'Ver alertas e resumos das triagens'],
  ['manage_users', 'Gerenciar triadores e coordenadores'],
  ['delete_history', 'Apagar o histórico de uso de triadores e coordenadores'],
];
export const PERMISSION_KEYS = PERMISSIONS.map(([k]) => k);

// Só o admin master: conexão do WhatsApp, quem recebe os alertas e apagar alertas/resumos.
// Nenhum admin tem isso, nem com a chave explícita em `permissions` (o banco também recusa: migração 0008).
export const MASTER_ONLY = ['manage_whatsapp', 'manage_recipients', 'delete_alerts'];

export function can(profile, perm) {
  if (!profile) return false;
  if (profile.role === 'admin_master') return true;
  if (profile.role !== 'admin') return false;
  if (MASTER_ONLY.includes(perm)) return false;
  return profile.permissions?.[perm] !== false;
}
export function normalizePermissions(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const k of PERMISSION_KEYS) if (typeof input[k] === 'boolean') out[k] = input[k];
  return out;
}
