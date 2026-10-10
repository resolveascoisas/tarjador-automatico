import { CATS } from './config.js';
import { state } from './state.js';
import { norm } from './data.js';
const FX = Object.fromEntries(CATS.filter(c => c.fx).map(c => [c.id, c.fx]));
const CONN = new Set(['de', 'da', 'do', 'dos', 'das', 'e']);
// Conjunções, preposições e artigos: nunca viram tarja por conta própria (as listas de nomes contêm "DE", "DA", "NA"…).
// Só entram no meio de um nome composto (ex.: "Maria da Silva"); sozinhas ou nas pontas, jamais.
const STOP = new Set(['de', 'da', 'do', 'dos', 'das', 'du', 'e', 'em', 'na', 'no', 'nas', 'nos', 'num', 'numa', 'por', 'pelo', 'pela', 'pelos', 'pelas',
  'para', 'pra', 'com', 'sem', 'sob', 'sobre', 'entre', 'ate', 'ao', 'aos', 'a', 'o', 'as', 'os', 'um', 'uma', 'se', 'que', 'ou', 'mas',
  'el', 'la', 'le', 'les', 'des', 'the', 'of', 'and', 'y']);
const cap = s => /^[A-ZÀ-ÝÇ]/.test(s.replace(/^[^A-Za-zÀ-ÿ]+/, ''));
export function lineBoxes(W, ids) { const out = []; let c = null;
  ids.forEach(i => { const w = W[i];
    if (c && Math.abs(w.y + w.h / 2 - (c.y + c.h / 2)) < w.h * 0.6) { const x2 = Math.max(c.x + c.w, w.x + w.w), y2 = Math.max(c.y + c.h, w.y + w.h); c.x = Math.min(c.x, w.x); c.y = Math.min(c.y, w.y); c.w = x2 - c.x; c.h = y2 - c.y; }
    else out.push(c = { x: w.x, y: w.y, w: w.w, h: w.h }); });
  // folga proporcional ao corpo da fonte: a tarja cobre o texto inteiro tanto em letra miúda quanto em título grande
  return out.map(b => { const px = Math.max(2, b.h * 0.15), py = Math.max(1.5, b.h * 0.08); return { x: b.x - px, y: b.y - py, w: b.w + 2 * px, h: b.h + 2 * py }; }); }

export function detectPage(p, idx, on) {
  const W = p.words, N = W.map(w => norm(w.t)), used = Array(W.length).fill(false);
  const free = ids => ids.every(i => !used[i]), take = ids => ids.forEach(i => used[i] = true);
  const add = (ids, cat, conf) => { ids = [...new Set(ids)].sort((a, b) => a - b); take(ids);
    state.hits.push({ id: state.nid++, page: p.n, cat, text: ids.map(i => W[i].t).join(' '), conf, status: conf === 'sure' ? 'accepted' : 'pending', boxes: lineBoxes(W, ids), ...(FX[cat] ? { fx: FX[cat] } : {}) }); };
  const extNum = ids => { let j = ids[ids.length - 1] + 1; if (j < W.length && /^n[º°o]?\.?$/i.test(W[j].t)) j++;
    if (j < W.length && !used[j] && /^\d{1,5}[A-Za-z]?[,.;]?$/.test(W[j].t)) for (let k = ids[ids.length - 1] + 1; k <= j; k++) ids.push(k); };

  // 1) padrões / documentos
  const text = W.map(w => w.t).join(' '), starts = []; let o = 0; W.forEach(w => { starts.push(o); o += w.t.length + 1; });
  const toIds = (a, b) => { const r = []; W.forEach((w, i) => { if (starts[i] < b && starts[i] + w.t.length > a) r.push(i); }); return r; };
  for (const c of CATS.filter(c => c.kind === 'regex' && on(c.id)).sort((a, b) => (a.ctx ? 0 : 1) - (b.ctx ? 0 : 1))) {
    const re = new RegExp(c.re.source, c.re.flags); let m;
    while ((m = re.exec(text))) { if (!m[0]) { re.lastIndex++; continue; }
      const [a, b] = c.ctx ? m.indices[1] : m.indices[0], conf = c.chk ? c.chk(text.slice(a, b)) : (c.conf || 'sure'); if (!conf) continue;
      const ids = toIds(a, b); if (ids.length && free(ids)) add(ids, c.id, conf); } }

  // 2) listas de frases (logradouros, bairros, cidades…)
  for (const c of CATS.filter(c => c.kind === 'phrase' && on(c.id))) { const m = idx[c.id]; if (!m) continue;
    for (let i = 0; i < W.length; i++) { const cands = m.get(N[i]); if (!cands || used[i] || !cap(W[i].t)) continue;
      for (const tk of cands) { if (tk.length === 1 && STOP.has(tk[0])) continue; const ids = tk.map((_, k) => i + k);
        if (ids[ids.length - 1] < W.length && tk.every((t, k) => N[i + k] === t) && free(ids)) { if (c.id === 'logradouros') extNum(ids); add(ids, c.id, c.conf); i += tk.length - 1; break; } } } }

  // 2b) heurística de endereço: "Rua/Avenida/Travessa… Nome Composto" fora da lista = dúvida
  if (on('logradouros') && idx._tipos && idx._tipos.size)
    for (let i = 0; i < W.length; i++) { if (used[i] || !idx._tipos.has(N[i]) || !cap(W[i].t)) continue;
      const ids = [i]; let j = i + 1;
      while (j < W.length && ids.length < 6 && !used[j] && ((cap(W[j].t) && !STOP.has(N[j])) || CONN.has(N[j])) && !/^\d/.test(W[j].t)) { ids.push(j); const end = /[,.;:]$/.test(W[j].t); j++; if (end) break; }
      while (ids.length && CONN.has(N[ids[ids.length - 1]])) ids.pop();
      if (ids.length < 2) continue; extNum(ids); add(ids, 'logradouros', 'doubt'); i = j - 1; }

  // 2c) pronomes de tratamento (PT/EN) + nome que os segue; sem nome conhecido = dúvida
  if (on('titulos') && idx.titulos) { const m = idx.titulos, known = i => (idx.nomes && idx.nomes.has(N[i])) || (idx.sobrenomes && idx.sobrenomes.has(N[i]));
    for (let i = 0; i < W.length; i++) { const cands = m.get(N[i]); if (!cands || used[i] || !cap(W[i].t)) continue;
      for (const tk of cands) { const ids = tk.map((_, k) => i + k); if (!(ids[ids.length - 1] < W.length && tk.every((t, k) => N[i + k] === t) && free(ids))) continue;
        let j = ids[ids.length - 1] + 1, n = 0, ok = false;
        while (j < W.length && n < 3 && !used[j]) { if (cap(W[j].t) && N[j] && !STOP.has(N[j]) && !/^\d/.test(W[j].t)) { ids.push(j); n++; ok = ok || known(j); j++; }
          else if (CONN.has(N[j]) && j + 1 < W.length && !used[j + 1] && cap(W[j + 1].t)) { ids.push(j, j + 1); n++; ok = ok || known(j + 1); j += 2; } else break; }
        if (!n) break; add(ids, 'titulos', ok ? 'sure' : 'doubt'); i = ids[ids.length - 1]; break; } } }

  // 3) nomes: sequência ≥2 = certo; isolado = dúvida
  const type = i => { if (used[i] || !cap(W[i].t) || STOP.has(N[i])) return null;
    if (on('nomes') && idx.nomes && idx.nomes.has(N[i])) return 'nomes'; if (on('sobrenomes') && idx.sobrenomes && idx.sobrenomes.has(N[i])) return 'sobrenomes'; return null; };
  for (let i = 0; i < W.length; i++) { const t0 = type(i); if (!t0) continue;
    const ids = [i]; let cnt = 1, j = i + 1;
    while (j < W.length) { if (type(j)) { ids.push(j); cnt++; j++; } else if (CONN.has(N[j]) && j + 1 < W.length && type(j + 1)) { ids.push(j, j + 1); cnt++; j += 2; } else break; }
    add(ids, t0, cnt >= 2 ? 'sure' : 'doubt'); i = j - 1; }
}
