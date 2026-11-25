// Catálogo de TOPs: funções puras que o app usa para listar os TOPs e aplicar a escolha na identificação do TOP.
// Os dados vêm de generated-top-catalog.js (gerado por scripts/gerar-catalogo-tops.mjs). Nada aqui inventa informação:
// campo que a fonte não traz (número do TOP, local, data) fica vazio e o rótulo diz "a confirmar".
import { TOP_CATALOG } from './generated-top-catalog.js';
export { TOP_CATALOG };

const br = iso => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '');

export function catalogLabel(e) {
  const quando = e.date ? (e.dateEnd && e.dateEnd !== e.date ? br(e.date) + ' a ' + br(e.dateEnd) : br(e.date)) : 'data a confirmar';
  return [quando, e.name || 'sem nome informado', ...(e.number ? ['TOP ' + e.number] : []), e.place || 'local a confirmar', ...(e.confirmed ? [] : ['não confirmado'])].join(' · ');
}

export function catalogGroups(catalog = TOP_CATALOG) {
  const grupos = [
    ['Brasil — calendário oficial', e => e.confirmed && e.country === 'Brasil'],
    ['Outros países — calendário oficial', e => e.confirmed && e.country !== 'Brasil'],
    ['Informados por você, não confirmados', e => !e.confirmed],
  ];
  return grupos.map(([label, filtro]) => ({ label, items: catalog.filter(filtro) }));
}

// O que a escolha preenche no formulário "Identificação do TOP". O número só vem quando a fonte o informa.
export function catalogToForm(e) {
  return { location: e.place, event: e.name, topNumber: e.number, logo: e.logo, logoBackground: e.logo ? 'dark' : '' };
}

export const findCatalogEntry = id => (id ? TOP_CATALOG.find(e => e.id === id) ?? null : null);
