// Inscrição do formulário Google -> participantes do app, pelo MESMO importador das planilhas (recordsToPreview):
// ele valida CPF/telefone, normaliza peso/altura/idade e gera os avisos. Cada inscrição é tratada sozinha:
// uma ficha inválida é rejeitada com o motivo e não derruba as demais.
import { recordsToPreview } from '../layouts.js';
import { fields as FIELD_DEFS } from '../core.js';
import { groups } from '../default-groups.js';

const FIELD_LABEL = Object.fromEntries(FIELD_DEFS);
const FLAG_LABEL = Object.fromEntries(Object.values(groups).flat().map(([id, label]) => [id, label]));
const PREP_KEYS = ['activity', 'walk', 'tetanus', 'prior'];
const digits = s => String(s ?? '').replace(/\D/g, '');
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const stamp = iso => { const d = new Date(iso); return Number.isNaN(+d) ? '' : d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }); };

export function submissionToRecord(item) {
  const rec = item.record || {};
  const where = `Formulário Google · ${stamp(item.receivedAt)} · resposta ${String(item.id || '').slice(0, 8)}`;
  const cells = [];
  for (const [key, value] of Object.entries(rec.fields || {})) cells.push({ key, label: FIELD_LABEL[key] || key, value, location: where, declared: true });
  for (const e of rec.extras || []) cells.push({ key: '', label: e.label, value: e.value, location: where, declared: true });
  for (const id of rec.flags || []) cells.push({ key: 'flag:' + id, label: FLAG_LABEL[id] || id, value: 'Sim', location: where, declared: true });
  return { cells };
}

export function submissionsToPreview(items) {
  const participants = [], ids = [], rejected = [], warnings = new Set();
  let verified = 0, needsReview = 0;
  for (const item of items) {
    try {
      const r = recordsToPreview([submissionToRecord(item)]);
      const p = r.participants[0];
      if (!p) throw Error('Inscrição sem dados.');
      for (const k of PREP_KEYS) if (item.record?.prep?.[k] !== undefined) p[k] = item.record.prep[k];
      const aviso = `Dados autodeclarados pelo participante no formulário Google (${stamp(item.receivedAt)}): confira com o participante e com os documentos.`;
      p.importWarnings.push(aviso);
      p.formSubmissionId = item.id;
      participants.push(p); ids.push(item.id);
      r.warnings.forEach(w => warnings.add(w)); warnings.add(aviso);
      verified += r.identifierChecks.verified; needsReview += r.identifierChecks.needsReview;
    } catch (e) {
      // O importador prefixa a origem ("Formulário Google · data · resposta id: ..."); na tela só interessa o motivo.
      rejected.push({ id: item.id, name: item.name || item.record?.fields?.name || '', error: String(e.message).replace(/^Formulário Google .*? resposta [0-9a-f-]*: /, '') });
    }
  }
  return { participants, ids, warnings: [...warnings], identifierChecks: { verified, needsReview }, rejected };
}

// Quem já está na lista da sessão: mesmo CPF, ou mesmo e-mail, ou mesmo nome com o mesmo telefone.
export function findExisting(record, participants) {
  const f = record?.fields || {};
  const cpf = digits(f.cpf), email = norm(f.email), name = norm(f.name), phone = digits(f.phone);
  return (participants || []).find(p => {
    if (cpf.length === 11 && digits(p.cpf) === cpf) return true;
    if (email && norm(p.email) === email) return true;
    return !!name && !!phone && norm(p.name) === name && digits(p.phone) === phone;
  }) || null;
}
