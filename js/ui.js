import { state } from './state.js';
import { CATS } from './config.js';
import { persist, hitKey } from './store.js';
import { track, canUndo, canRedo, undoAct, redoAct } from './history.js';
import { ensureWords as ensureW, findAll, termFromBox, addMatches } from './search.js';
const $ = id => document.getElementById(id);
const label = id => id === 'manual' ? 'Manual' : id === 'busca' ? 'Busca' : (CATS.find(c => c.id === id) || { label: id }).label;
const ico = t => `<i class="ic ${t}"></i>`;

export function buildPages() {
  const root = $('pages'); root.innerHTML = '';
  state.pages.forEach(p => { p.wrap = document.createElement('div'); p.wrap.className = 'pg'; p.ov = document.createElement('div');
    p.wrap.append(p.canvas, p.ov, Object.assign(document.createElement('span'), { className: 'pn', textContent: 'Página ' + p.n }));
    root.appendChild(p.wrap); bindEditing(p); });
  setFit('width'); refresh(); pageLabel();
}
export function refresh() { hideTip(); track(); drawOverlays(); drawList(); persist(); $('undo').disabled = !canUndo(); $('redo').disabled = !canRedo(); }
export function undoRedo(kind) { const ok = kind === 'undo' ? undoAct() : redoAct();
  $('status').textContent = ok ? (kind === 'undo' ? 'Desfeito.' : 'Refeito.') : (kind === 'undo' ? 'Nada para desfazer.' : 'Nada para refazer.'); if (ok) refresh(); }
export function setMode(m) { state.mode = m; document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === m)); drawOverlays(); }
export function setFx(f) { state.fx = f; document.querySelectorAll('[data-fx]').forEach(b => b.classList.toggle('on', b.dataset.fx === f)); }
export function setReveal(v) { state.reveal = v; drawOverlays(); }

/* ----- ajuste à tela / zoom / navegação ----- */
export function layout() { const v = $('viewer'), cw = v.clientWidth - 30, ch = v.clientHeight - 40;
  state.pages.forEach(p => { if (!p.wrap) return; const base = state.fit === 'page' ? Math.min(cw, ch * p.W / p.H) : cw; p.wrap.style.width = Math.max(140, base * state.zoom) + 'px'; }); }
export function setZoom(z) { state.zoom = Math.min(4, Math.max(0.3, z)); $('zoomv').textContent = Math.round(state.zoom * 100) + '%'; layout(); }
export function setFit(f) { state.fit = f; document.querySelectorAll('[data-fit]').forEach(b => b.classList.toggle('on', b.dataset.fit === f)); setZoom(1); }
const cur = () => { const v = $('viewer').getBoundingClientRect(), mid = v.top + v.height / 2; let best = 0, bd = 1e9;
  state.pages.forEach((p, i) => { const r = p.wrap.getBoundingClientRect(), d = Math.abs((r.top + r.bottom) / 2 - mid); if (d < bd) { bd = d; best = i; } }); return best; };
export function pageLabel() { $('pgn').textContent = state.pages.length ? `${cur() + 1} / ${state.pages.length}` : '–'; }
export function nav(d) { if (!state.pages.length) return; const p = state.pages[Math.min(state.pages.length - 1, Math.max(0, cur() + d))]; p.wrap.scrollIntoView({ behavior: 'smooth', block: 'center' }); }

/* ----- dica instantânea (tooltip) ----- */
let tipEl = null;
export function hideTip() { if (tipEl) tipEl.style.display = 'none'; }
export function initTip() {
  tipEl = document.createElement('div'); tipEl.id = 'tip'; document.body.appendChild(tipEl);
  document.addEventListener('mouseover', e => { const t = e.target.closest && e.target.closest('[data-tip]'); if (!t) return hideTip();
    tipEl.textContent = t.dataset.tip; tipEl.style.display = 'block';
    const r = t.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    tipEl.style.left = Math.max(6, Math.min(innerWidth - w - 6, r.left + r.width / 2 - w / 2)) + 'px';
    tipEl.style.top = (r.top - h - 8 < 6 ? r.bottom + 8 : r.top - h - 8) + 'px'; });
  document.addEventListener('pointerdown', hideTip); document.addEventListener('scroll', hideTip, true);
  document.documentElement.addEventListener('mouseleave', hideTip);
}

/* ----- ações de like / lixeira (agem sobre um grupo de ocorrências iguais) ----- */
const q = t => '“' + (t.length > 60 ? t.slice(0, 57) + '…' : t) + '”';
function act(hs, kind) {
  hs.forEach(h => {
    if (kind === 'like') { delete state.ignored[hitKey(h)]; if (h.status === 'accepted') h.confirmed = true; else h.status = 'accepted'; }
    else if (h.cat === 'manual') state.hits = state.hits.filter(x => x !== h); else h.status = 'rejected'; });
  refresh();
}
const one = h => h.status === 'pending' ? ['like', 'trash']
  : h.status === 'accepted' ? (h.cat === 'manual' ? ['trash'] : [...(h.confirmed ? [] : ['like']), 'trash']) : ['like'];
const actionsFor = hs => ['like', 'trash'].filter(k => hs.some(h => one(h).includes(k)));
function tipText(hs, kind) { const h = hs[0], x = hs.length > 1 ? ` (${hs.length} ocorrências)` : '', nm = h.fx === 'blur' ? 'borrão' : 'tarja';
  if (kind === 'like') return `${h.status === 'accepted' ? 'Confirmar' : 'Aceitar'} ${nm} de ${q(h.text)}${x}`;
  if (h.cat === 'manual') return /manual$/.test(h.text) ? `Remover ${nm} manual` : `Remover ${nm} de ${q(h.text)}${x}`;
  return `Não aceitar ${nm} de ${q(h.text)}${x}`; }

// hold=true (botões sobre o documento): segurar a lixeira abre o modal "não aceitar em todos os casos"
function btn(hs, kind, hold) { const b = document.createElement('button'); b.className = 'ab ' + kind; b.innerHTML = ico(kind); b.type = 'button';
  const canHold = hold && kind === 'trash' && hs[0].cat !== 'manual' && !hs[0].img;
  b.dataset.tip = tipText(hs, kind) + (canHold ? '\nSegure para não aceitar todas as ocorrências' : ''); b.setAttribute('aria-label', b.dataset.tip.split('\n')[0]);
  let timer = null, fired = false; const stop = () => { clearTimeout(timer); b.classList.remove('holding'); };
  if (canHold) { b.oncontextmenu = e => e.preventDefault();
    b.onpointerdown = e => { e.stopPropagation(); fired = false; b.classList.add('holding');
      timer = setTimeout(() => { fired = true; stop(); hideTip(); askRejectAll(hs[0]); }, 550); };
    b.onpointerup = b.onpointerleave = b.onpointercancel = stop; }
  b.onclick = e => { e.stopPropagation(); if (fired) { fired = false; return; } act(hs, kind); }; return b; }

function askRejectAll(h) {
  const key = hitKey(h), same = state.hits.filter(x => x.cat !== 'manual' && hitKey(x) === key), n = same.length;
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = '<div class="card" role="dialog" aria-modal="true"><h4>Não aceitar para todos os casos em que essa palavra apareça</h4><p class="w"></p><p class="s"></p>' +
    '<div class="btns"><button type="button" class="cancel">Cancelar</button><button type="button" class="danger pri">Não aceitar todos</button></div></div>';
  m.querySelector('.w').textContent = q(h.text);
  m.querySelector('.s').textContent = `${n} ocorrência${n > 1 ? 's' : ''} neste documento ${n > 1 ? 'serão rejeitadas' : 'será rejeitada'}, e essa palavra será ignorada também em novas análises deste documento.`;
  const close = () => { document.removeEventListener('keydown', key_); m.remove(); }, key_ = e => { if (e.key === 'Escape') close(); };
  m.onclick = e => { if (e.target === m) close(); }; m.querySelector('.cancel').onclick = close;
  m.querySelector('.danger').onclick = () => { same.forEach(x => x.status = 'rejected'); state.ignored[key] = h.text; close(); refresh();
    $('status').textContent = `“${h.text}” não será mais tarjada (${n} ocorrência${n > 1 ? 's' : ''} rejeitada${n > 1 ? 's' : ''}).`; };
  document.addEventListener('keydown', key_); document.body.appendChild(m); m.querySelector('.cancel').focus();
}

/* ----- etiqueta "Todos": aplica a tarja manual a todas as ocorrências da mesma palavra ----- */
const canAll = h => h.cat === 'manual' && h.status === 'accepted';
let busyAll = false;
async function applyAll(h) { if (busyAll) return; busyAll = true; const st = t => $('status').textContent = t;
  try { const p = state.pages[h.page - 1]; let term = h.text;
    if (/manual$/.test(h.text)) { await ensureW(p, st); term = termFromBox(p, h); }
    if (!term) { st('Não há texto reconhecido sob essa tarja — o “Todos” precisa de uma palavra (use “Palavra” ou desenhe sobre texto).'); return; }
    const ms = await findAll(term, {}, st), n = addMatches(ms, 'manual', h.fx);
    if (/manual$/.test(h.text)) h.text = term; state.lastManual = null; refresh();
    st(`“${term}”: ${ms.length} ocorrência(s) no documento, ${n} nova(s) tarja(s)${ms.length - n ? ` (${ms.length - n} já cobertas)` : ''}.`); }
  catch (err) { console.error(err); st('Erro na busca: ' + err.message); } finally { busyAll = false; } }
function allTag(h) { const b = document.createElement('button'); b.type = 'button'; b.className = 'ab all'; b.textContent = 'Todos';
  b.dataset.tip = `Aplicar ${h.fx === 'blur' ? 'borrão' : 'tarja'} a todos os casos ${/manual$/.test(h.text) ? 'desta palavra' : 'de ' + q(h.text)} no documento`; b.setAttribute('aria-label', b.dataset.tip);
  b.onclick = e => { e.stopPropagation(); applyAll(h); }; return b; }

function drawOverlays() {
  state.pages.forEach(p => { p.ov.className = 'ov ' + state.mode + (state.reveal ? ' reveal' : ''); p.ov.innerHTML = '';
    state.hits.filter(h => h.page === p.n).forEach(h => {
      h.boxes.forEach(b => { const d = document.createElement('div'); d.className = 'box ' + h.status + (h.confirmed ? ' conf' : '') + (h.fx === 'blur' ? ' blur' : ''); d.dataset.h = h.id; d.title = `${label(h.cat)}: ${h.text}`;
        Object.assign(d.style, { left: b.x / p.W * 100 + '%', top: b.y / p.H * 100 + '%', width: b.w / p.W * 100 + '%', height: b.h / p.H * 100 + '%' });
        d.onclick = e => { e.stopPropagation(); if (h.cat === 'manual') state.hits = state.hits.filter(x => x !== h);
          else if (h.status === 'accepted') h.status = 'rejected'; else { h.status = 'accepted'; delete state.ignored[hitKey(h)]; } refresh(); };
        p.ov.appendChild(d); });
      if (h.status !== 'pending' && !state.reveal && h.id !== state.lastManual) return;
      const b = h.boxes[0], a = document.createElement('div'); a.className = 'acts'; a.style.left = (b.x + b.w) / p.W * 100 + '%'; a.style.top = b.y / p.H * 100 + '%';
      actionsFor([h]).forEach(k => a.appendChild(btn([h], k, true))); if (canAll(h)) a.appendChild(allTag(h)); p.ov.appendChild(a); }); });
}

/* ----- lista: ocorrências iguais são aglutinadas, com a contagem ----- */
const cyc = {};
function groups(arr) { const m = new Map();
  arr.forEach(h => { const k = h.cat === 'manual' || h.img ? 'm' + h.id : hitKey(h) || 'i' + h.id; (m.get(k) || m.set(k, []).get(k)).push(h); }); return [...m]; }
function pagesLabel(hs) { const ps = [...new Set(hs.map(h => h.page))].sort((a, b) => a - b); return 'p.' + ps.slice(0, 3).join(', ') + (ps.length > 3 ? ` +${ps.length - 3}` : ''); }
function drawList() {
  const L = $('list'); L.innerHTML = '';
  if (!state.hits.length) { L.innerHTML = '<p class="hint">As ocorrências aparecem aqui após a análise.</p>'; $('stats').textContent = ''; return; }
  const by = s => state.hits.filter(h => h.status === s).sort((a, b) => a.page - b.page || (a.boxes[0]?.y - b.boxes[0]?.y));
  const sec = (title, arr) => { if (!arr.length) return; L.appendChild(Object.assign(document.createElement('h3'), { textContent: `${title} (${arr.length})` }));
    groups(arr).forEach(([k, hs]) => { const h = hs[0], d = document.createElement('div'); d.className = 'item' + (h.status === 'rejected' ? ' rej' : '');
      const cats = [...new Set(hs.map(x => label(x.cat)))].join(' / ');
      d.innerHTML = '<span class="t"></span>' + (hs.length > 1 ? '<span class="cnt"></span>' : '') + '<span class="chip"></span>';
      d.children[0].textContent = h.text; if (hs.length > 1) d.children[1].textContent = '×' + hs.length; d.lastChild.textContent = `${cats} · ${pagesLabel(hs)}`;
      actionsFor(hs).forEach(a => d.appendChild(btn(hs, a, false))); if (hs.length === 1 && canAll(h)) d.appendChild(allTag(h));
      d.onclick = () => { const i = (cyc[k] || 0) % hs.length; cyc[k] = i + 1; focusHit(hs[i]);
        if (hs.length > 1) $('status').textContent = `“${q(h.text).slice(1, -1)}” — ocorrência ${i + 1} de ${hs.length} (p.${hs[i].page})`; };
      L.appendChild(d); }); };
  sec('Para revisar (dúvidas)', by('pending')); sec('Tarjas aplicadas', by('accepted')); sec('Rejeitadas', by('rejected'));
  $('stats').textContent = `${by('pending').length} dúvida(s) · ${by('accepted').length} aplicada(s)`;
}
function focusHit(h) { const p = state.pages[h.page - 1]; p.wrap.scrollIntoView({ block: 'center', behavior: 'smooth' });
  p.ov.querySelectorAll(`[data-h="${h.id}"]`).forEach(b => { b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 1500); }); }
export function bulk(from, to) { state.hits.forEach(h => h.status === from && (h.status = to)); refresh(); }

/* ----- edição manual ----- */
function bindEditing(p) {
  const pt = e => { const r = p.ov.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * p.W, y: (e.clientY - r.top) / r.height * p.H }; };
  const addManual = (b, text) => { const fx = state.fx === 'blur'; state.lastManual = state.nid; state.hits.push({ id: state.nid++, page: p.n, cat: 'manual', text: text || (fx ? 'Borrão manual' : 'Tarja manual'), conf: 'sure', status: 'accepted', boxes: [b], ...(fx ? { fx: 'blur' } : {}) }); refresh(); };
  let start = null, tmp = null;
  const ensureWords = () => ensureW(p, t => $('status').textContent = t);
  const wordAt = (q, W) => W.find(w => { const t = Math.max(3, w.h * 0.25); return q.x >= w.x - t && q.x <= w.x + w.w + t && q.y >= w.y - t && q.y <= w.y + w.h + t; });
  p.ov.onpointerdown = async e => { if (e.target.closest && e.target.closest('.acts')) return;
    if (state.mode === 'word') { const q = pt(e); let W = p.words;
      try { if (!W) W = await ensureWords(); } catch (err) { console.error(err); $('status').textContent = 'Não foi possível ler o texto desta página.'; return; }
      const w = wordAt(q, W || []); if (!w) { $('status').textContent = 'Nenhuma palavra encontrada ali. Se o texto é imagem, use OCR (“Leitura do texto”) ou o modo Desenhar.'; return; }
      const cx = w.x + w.w / 2, cy = w.y + w.h / 2;
      if (state.hits.some(h => h.page === p.n && h.status === 'accepted' && h.boxes.some(b => cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h))) { $('status').textContent = `“${w.t}” já está tarjada.`; return; }
      const px = Math.max(2, w.h * 0.15), py = Math.max(1.5, w.h * 0.08); addManual({ x: w.x - px, y: w.y - py, w: w.w + 2 * px, h: w.h + 2 * py }, w.t); $('status').textContent = `Tarja aplicada em “${w.t}”.`; }
    else if (state.mode === 'draw') { if (e.target !== p.ov) return; start = pt(e); p.ov.setPointerCapture(e.pointerId); tmp = document.createElement('div'); tmp.className = 'box pending'; p.ov.appendChild(tmp); } };
  p.ov.onpointermove = e => { if (!start) return; const q = pt(e);
    Object.assign(tmp.style, { left: Math.min(start.x, q.x) / p.W * 100 + '%', top: Math.min(start.y, q.y) / p.H * 100 + '%', width: Math.abs(q.x - start.x) / p.W * 100 + '%', height: Math.abs(q.y - start.y) / p.H * 100 + '%' }); };
  p.ov.onpointerup = e => { if (!start) return; const q = pt(e), b = { x: Math.min(start.x, q.x), y: Math.min(start.y, q.y), w: Math.abs(q.x - start.x), h: Math.abs(q.y - start.y) };
    start = null; tmp = null; if (b.w > 3 && b.h > 3) addManual(b); else drawOverlays(); };
}
