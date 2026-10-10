// Busca livre no texto do documento + "Todos" (aplicar uma tarja manual a todas as ocorrências da mesma palavra).
import { state } from './state.js';
import { norm } from './data.js';
import { readWords } from './pdfio.js';
import { lineBoxes } from './detect.js';

export async function ensureWords(p, status = () => {}) {
  if (p.words) return p.words; const mode = document.getElementById('ocrMode').value;
  p.words = await readWords(p, mode, status); p.wordsMode = mode; return p.words; }

// Acha todas as ocorrências (sem diferenciar maiúsculas/acentos/pontuação). Várias palavras = sequência. contains: pedaço de palavra (só para termo de 1 palavra).
export async function findAll(term, { contains = false } = {}, status = () => {}) {
  const toks = term.trim().split(/\s+/).map(norm).filter(Boolean), out = []; if (!toks.length) return out;
  for (const p of state.pages) { status(`Buscando na página ${p.n}/${state.pages.length}…`);
    const W = await ensureWords(p, status), idx = []; W.forEach((w, i) => { if (norm(w.t)) idx.push(i); }); const N = idx.map(i => norm(W[i].t));
    for (let k = 0; k + toks.length <= N.length; k++) {
      if (!(toks.length === 1 && contains ? N[k].includes(toks[0]) : toks.every((t, j) => N[k + j] === t))) continue;
      const ids = idx.slice(k, k + toks.length); out.push({ page: p.n, text: ids.map(i => W[i].t).join(' '), boxes: lineBoxes(W, ids) }); k += toks.length - 1; } }
  return out;
}
// Palavras que ficam sob uma tarja desenhada à mão (para o "Todos" funcionar também com Desenhar)
export function termFromBox(p, h) { return (p.words || []).filter(w => { const cx = w.x + w.w / 2, cy = w.y + w.h / 2;
  return h.boxes.some(b => cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h); }).map(w => w.t).join(' ').trim(); }

// Cria as tarjas, pulando o que já está coberto por uma tarja aceita com o mesmo efeito. Devolve quantas foram criadas.
export function addMatches(ms, cat, fx) { let n = 0;
  ms.forEach(m => { const b = m.boxes[0], cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    if (state.hits.some(h => h.page === m.page && h.status === 'accepted' && (h.fx === 'blur') === (fx === 'blur') && h.boxes.some(x => cx >= x.x && cx <= x.x + x.w && cy >= x.y && cy <= x.y + x.h))) return;
    state.hits.push({ id: state.nid++, page: m.page, cat, text: m.text, conf: 'sure', status: 'accepted', boxes: m.boxes, ...(fx === 'blur' ? { fx: 'blur' } : {}) }); n++; });
  return n; }
