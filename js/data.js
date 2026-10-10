import { CATS, CSV_CATS, AUX_CSV } from './config.js';
import { fetchList } from './settings.js';
export const store = {};
export const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
const HEAD = /^(nomes?|sobrenomes?|logradouros?|localidades?|bairros?|estados?|paises|titulos|organiza[cç][oõ]es|tipos?_?logradouro)$/i;
export const parseCsv = t => { const l = t.split(/\r?\n/).map(x => x.split(/[;\t,]/)[0].replace(/^"|"$/g, '').trim()).filter(Boolean);
  if (l.length && HEAD.test(l[0])) l.shift(); return l; };
export async function loadDefaults() { let fails = 0;
  await Promise.all([...CSV_CATS, ...AUX_CSV].map(async id => { try { store[id] = await fetchList(id); } catch { store[id] = ''; fails++; } }));
  return fails; }
export function buildIndex(on) { const idx = {};
  for (const c of CATS) { if (!['dict', 'phrase', 'titles'].includes(c.kind)) continue;
    if (!on(c.id) && !(c.kind === 'dict' && on('titulos'))) continue;       // nomes são úteis para avaliar a confiança dos títulos
    const list = parseCsv(store[c.id] || '');
    if (c.kind === 'dict') idx[c.id] = new Set(list.map(norm).filter(Boolean));
    else { const m = new Map(); list.forEach(e => { const tk = e.split(/\s+/).map(norm).filter(Boolean); if (tk.length) (m.get(tk[0]) || m.set(tk[0], []).get(tk[0])).push(tk); });
      m.forEach(a => a.sort((x, y) => y.length - x.length)); idx[c.id] = m; } }
  idx._tipos = new Set(parseCsv(store.tipos_logradouro || '').map(norm)); return idx; }
