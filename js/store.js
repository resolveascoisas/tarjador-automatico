// Memória do navegador (IndexedDB): guarda, por documento, tudo o que foi feito — assim fechar a aba não perde o progresso.
// O documento é identificado pelo hash SHA-256 do arquivo (renomear o PDF não atrapalha; abrir outro PDF não mistura).
import { state } from './state.js';
import { norm } from './data.js';
import { WORDS_V } from './config.js';

export const hitKey = h => norm(h.text);

const DB = 'tarjador', ST = 'docs';
let dbp = null;
const db = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(ST, { keyPath: 'key' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(ST, mode), q = fn(t.objectStore(ST));
  t.oncomplete = () => res(q && q.result); t.onerror = t.onabort = () => rej(t.error); }); };

export async function docKey(file) {
  try { const h = await crypto.subtle.digest('SHA-256', await file.arrayBuffer()); return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join(''); }
  catch { return `${file.name}|${file.size}|${file.lastModified}`; }
}
export const loadDoc = key => tx('readonly', s => s.get(key)).catch(() => null);
export async function clearDoc(key) { clearTimeout(timer); state.hasRec = false; try { await tx('readwrite', s => s.delete(key)); } catch {} setSaved(''); }

const setSaved = t => { const e = document.getElementById('saved'); if (e) e.textContent = t; };
let timer = null;
export function persist() { if (!state.docKey) return; clearTimeout(timer); timer = setTimeout(save, 350); }
export const flush = () => { if (timer) { clearTimeout(timer); return save(); } };
async function save() { timer = null;
  const meaningful = state.hasRec || state.hits.length || Object.keys(state.ignored).length || state.pages.some(p => p.words);
  if (!state.docKey || !meaningful) return;
  const rec = { key: state.docKey, name: state.docName, savedAt: Date.now(), nid: state.nid, ignored: state.ignored, enabled: state.enabled,
    imgOn: state.imgOn, ocrMode: document.getElementById('ocrMode').value, hits: state.hits, words: state.pages.map(p => p.words ? { mode: p.wordsMode, w: p.words, v: WORDS_V, o: !!p.ocr } : null) };
  try { await tx('readwrite', s => s.put(rec)); state.hasRec = true; setSaved('● progresso salvo neste navegador · ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })); }
  catch (e) { console.warn(e); setSaved('⚠ não foi possível salvar o progresso'); } }
document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
addEventListener('pagehide', flush);

// Reanálise: preserva as decisões já tomadas (mesma página, mesmo texto, mesma posição) e respeita a lista de palavras ignoradas.
export function carryOver(prev) {
  const near = (a, b) => { const t = Math.max(6, a.h * 0.5); return Math.abs(a.x + a.w / 2 - b.x - b.w / 2) < t && Math.abs(a.y + a.h / 2 - b.y - b.h / 2) < t; };
  state.hits.forEach(h => { if (h.cat === 'manual' || h.cat === 'busca') return;
    const o = prev.find(p => p.page === h.page && h.boxes[0] && p.boxes[0] && norm(p.text) === norm(h.text) && near(p.boxes[0], h.boxes[0]));
    if (o) { h.status = o.status; if (o.confirmed) h.confirmed = true; }  // (decisão do usuário sobrevive à reanálise)
    if (state.ignored[hitKey(h)]) h.status = 'rejected'; });
}
