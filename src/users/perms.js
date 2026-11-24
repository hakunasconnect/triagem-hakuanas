// Permissões do papel "admin" (abaixo do admin master). Padrão: tudo liberado; o admin master liga/desliga.
export const PERMISSIONS = [
  ['view_metrics', 'Ver as métricas de uso'],
  ['view_alerts', 'Ver alertas e resumos das triagens'],
  ['manage_recipients', 'Gerenciar quem recebe os alertas no WhatsApp'],
  ['manage_whatsapp', 'Conectar o WhatsApp e enviar teste'],
  ['manage_users', 'Gerenciar triadores e coordenadores'],
  ['delete_history', 'Apagar históricos e alertas'],
];
export const PERMISSION_KEYS = PERMISSIONS.map(([k]) => k);

export function can(profile, perm) {
  if (!profile) return false;
  if (profile.role === 'admin_master') return true;
  if (profile.role !== 'admin') return false;
  return profile.permissions?.[perm] !== false;
}
export function normalizePermissions(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const k of PERMISSION_KEYS) if (typeof input[k] === 'boolean') out[k] = input[k];
  return out;
}
