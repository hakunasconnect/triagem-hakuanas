// Inscrição enviada pelo formulário Google: valida e normaliza o que chega de fora antes de guardar.
// Só entra o que o app conhece (campos de identificação e critérios do protocolo); todo o resto é descartado.
import { fields as FIELD_DEFS } from '../core.js';
import { groups } from '../default-groups.js';

export const FIELD_KEYS = FIELD_DEFS.map(([k]) => k);
export const FLAG_IDS = [...new Set(Object.values(groups).flat().map(([id]) => id))];
const PREP = { activity: ['0', '1', '2', '3'], walk: ['0', '1', '2'], tetanus: ['0', '1'], prior: ['0', '1'] };
const MULTILINE = new Set(['notes', 'medical', 'medication', 'condition', 'health', 'diet', 'important', 'allergy', 'certificateText', 'emergency']);
const LIMITS = { name: 200, notes: 4000, default: 1500, multi: 1500, extras: 80, answers: 150, label: 120, value: 1000, q: 200, a: 1500 };

const oneLine = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const manyLines = (v, n) => String(v ?? '').replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, n);
const asText = v => (Array.isArray(v) ? v.map(x => String(x ?? '')).join('; ') : String(v ?? ''));

function ageOn(birthDate, when) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birthDate || ''));
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  let age = when.getUTCFullYear() - y;
  if (when.getUTCMonth() + 1 < mo || (when.getUTCMonth() + 1 === mo && when.getUTCDate() < d)) age--;
  return age >= 0 && age <= 120 ? String(age) : null;
}

export function normalizeSubmission(input, { now = new Date() } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Inscrição inválida.');
  const responseId = oneLine(input.responseId, 200);
  if (!responseId) throw Error('Falta o id da resposta do formulário.');
  const submittedMs = Date.parse(input.submittedAt);
  const submittedAt = new Date(Number.isFinite(submittedMs) ? submittedMs : now.getTime()).toISOString();

  const fields = {};
  const src = input.fields && typeof input.fields === 'object' ? input.fields : {};
  for (const key of FIELD_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(src, key)) continue;
    const limit = key === 'name' ? LIMITS.name : key === 'notes' ? LIMITS.notes : LIMITS.default;
    const value = MULTILINE.has(key) ? manyLines(asText(src[key]), limit) : oneLine(asText(src[key]), limit);
    if (value) fields[key] = value;
  }
  if (!fields.name || fields.name.length < 2) throw Error('Falta o nome completo do participante.');
  if (!fields.age) { const age = ageOn(input.birthDate, new Date(submittedAt)); if (age) fields.age = age; }

  const flags = [...new Set((Array.isArray(input.flags) ? input.flags : []).map(String).filter(id => FLAG_IDS.includes(id)))];
  const prep = {};
  for (const [key, allowed] of Object.entries(PREP)) { const v = String(input.prep?.[key] ?? ''); if (allowed.includes(v)) prep[key] = v; }

  const extras = (Array.isArray(input.extras) ? input.extras : []).filter(e => e && typeof e === 'object')
    .map(e => ({ label: oneLine(e.label, LIMITS.label), value: manyLines(asText(e.value), LIMITS.value) })).filter(e => e.label && e.value).slice(0, LIMITS.extras);
  const answers = (Array.isArray(input.answers) ? input.answers : []).filter(a => a && typeof a === 'object')
    .map(a => ({ q: oneLine(a.q, LIMITS.q), v: manyLines(asText(a.v), LIMITS.a) })).filter(a => a.q).slice(0, LIMITS.answers);

  return { responseId, top: oneLine(input.top, 20), submittedAt, name: fields.name, record: { fields, extras, flags, prep }, answers };
}
