import { state } from './state.js';
import { CATS, GROUPS, IMG_CATS } from './config.js';
import { loadDefaults, buildIndex } from './data.js';
import { openPdf, readWords } from './pdfio.js';
import { detectPage } from './detect.js';
import { buildPages, refresh, setMode, setReveal, bulk, layout, setZoom, setFit, nav, pageLabel, initTip, setFx, undoRedo } from './ui.js';
import { resetHistory } from './history.js';
import { findAll, addMatches } from './search.js';
import { detectVision } from './vision.js';
import { WORDS_V } from './config.js';
import { docKey, loadDoc, clearDoc, persist, carryOver } from './store.js';
import { exportPdf } from './export.js';
import { initLayout } from './layout.js';
initLayout(); initTip();
const $ = id => document.getElementById(id), status = t => $('status').textContent = t;
if (location.protocol === 'file:') $('warn').hidden = false;

/* painel de categorias (somente seleção; as listas vêm do backend) */
CATS.forEach(c => state.enabled[c.id] = !c.off);
const catsEl = $('cats');
// reconhecimento de imagem só roda com o mestre ligado; as demais categorias dependem só da própria caixa
const on = id => !!state.enabled[id] && (state.imgOn || !IMG_CATS.has(id));
const master = document.createElement('label'); master.className = 'cat master'; master.title = 'Rostos, assinaturas e placas em imagens: mais lento e baixa um detector na primeira vez';
master.innerHTML = '<input type="checkbox" data-m="img"><i class="ic image"></i><span>Incluir reconhecimento de imagem</span>'; catsEl.appendChild(master);
const syncMaster = () => { master.querySelector('input').checked = state.imgOn; catsEl.classList.toggle('imgoff', !state.imgOn); };
master.querySelector('input').onchange = e => { state.imgOn = e.target.checked; syncMaster(); if (state.imgOn) catsEl.querySelector('details[data-grp="img"]').open = true; persist(); };
syncMaster();
Object.entries(GROUPS).forEach(([g, name], gi) => {
  const det = document.createElement('details'); det.dataset.grp = g; det.open = g === 'pessoas' || g === 'docs';
  det.innerHTML = `<summary>${name}<a href="#" data-g="${g}">todos</a></summary>`;
  CATS.filter(c => c.group === g).forEach(c => { const row = document.createElement('label'); row.className = 'cat';
    row.innerHTML = `<input type="checkbox" data-c="${c.id}" ${state.enabled[c.id] ? 'checked' : ''}><span>${c.label}</span>`; det.appendChild(row); });
  catsEl.appendChild(det);
});
catsEl.addEventListener('change', e => { if (e.target.dataset.c) { state.enabled[e.target.dataset.c] = e.target.checked; persist(); } });
const syncCats = () => { catsEl.querySelectorAll('input[data-c]').forEach(i => i.checked = !!state.enabled[i.dataset.c]); syncMaster(); };
$('ocrMode').onchange = persist;
catsEl.addEventListener('click', e => { const g = e.target.dataset.g; if (!g) return; e.preventDefault();
  const boxes = [...catsEl.querySelectorAll('input[data-c]')].filter(i => CATS.find(c => c.id === i.dataset.c).group === g), all = boxes.every(i => i.checked);
  boxes.forEach(i => { i.checked = !all; state.enabled[i.dataset.c] = !all; }); persist(); });
loadDefaults().then(fails => { if (fails) status('Listas de dados indisponíveis (verifique o backend).'); });

/* PDF (o progresso de cada documento fica salvo no navegador, identificado pelo conteúdo do arquivo) */
$('pdfIn').onchange = async e => { const f = e.target.files[0]; if (!f) return;
  state.hits = []; state.pages = []; state.ignored = {}; state.docKey = null; state.hasRec = false; $('saved').textContent = ''; $('clearMem').hidden = true;
  try { const key = await docKey(f), r = await openPdf(f, (n, t) => status(`Renderizando página ${n}/${t}…`)), rec = await loadDoc(key);
    state.pdf = r.pdf; state.pages = r.pages; let msg = `${r.pages.length} página(s) carregada(s). Clique em “Analisar documento”.`;
    if (rec) { state.hits = rec.hits || []; state.nid = Math.max(state.nid, rec.nid || 1); state.ignored = rec.ignored || {}; Object.assign(state.enabled, rec.enabled || {}); state.imgOn = !!rec.imgOn; syncCats();
      if (rec.ocrMode) $('ocrMode').value = rec.ocrMode;
      (rec.words || []).forEach((w, i) => { if (w && w.v === WORDS_V && state.pages[i]) { state.pages[i].words = w.w; state.pages[i].wordsMode = w.mode; state.pages[i].ocr = !!w.o; } });
      state.hasRec = true; const n = state.hits.filter(h => h.cat !== 'manual').length, m = state.hits.length - n;
      msg = `Progresso restaurado (salvo em ${new Date(rec.savedAt).toLocaleString('pt-BR')}): ${n} ocorrência(s) automática(s)${m ? ` e ${m} tarja(s) manual(is)` : ''}.`; }
    state.docKey = key; state.docName = f.name; $('clearMem').hidden = false; resetHistory(); buildPages(); status(msg); }
  catch (err) { console.error(err); status('Erro ao abrir PDF: ' + err.message); } };
$('clearMem').onclick = async () => { if (!state.docKey || !confirm('Apagar todo o progresso salvo deste documento (tarjas aceitas, rejeitadas e palavras ignoradas)?')) return;
  await clearDoc(state.docKey); state.hits = []; state.ignored = {}; resetHistory(); refresh(); status('Progresso deste documento apagado.'); };

/* análise */
$('go').onclick = async () => {
  if (!state.pages.length) return status('Abra um PDF primeiro.');
  const btn = $('go'), prog = $('prog'); btn.disabled = true; prog.hidden = false;
  const mine = h => h.cat === 'manual' || h.cat === 'busca', prev = state.hits.filter(h => !mine(h)); state.hits = state.hits.filter(mine); const idx = buildIndex(on), mode = $('ocrMode').value;
  try { for (const p of state.pages) { prog.value = (p.n - 1) / state.pages.length * 100; status(`Analisando página ${p.n}/${state.pages.length}…`);
      if (!p.words || p.wordsMode !== mode) { p.words = await readWords(p, mode, status); p.wordsMode = mode; }
      detectPage(p, idx, on); await detectVision(p, on, status); }
    carryOver(prev);
    const n = state.hits.filter(h => h.cat !== 'manual').length; status(`Concluído: ${n} ocorrência(s) encontrada(s).`); }
  catch (err) { console.error(err); status('Erro: ' + err.message); }
  btn.disabled = false; prog.hidden = true; refresh();
};

/* desfazer / refazer: Ctrl+Z · Ctrl+Y · Ctrl+Shift+Z */
$('undo').onclick = () => undoRedo('undo'); $('redo').onclick = () => undoRedo('redo');
document.addEventListener('keydown', e => { if (!(e.ctrlKey || e.metaKey) || e.altKey || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || document.querySelector('.modal')) return;
  const k = e.key.toLowerCase(); if (k === 'z' && !e.shiftKey) { e.preventDefault(); undoRedo('undo'); } else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); undoRedo('redo'); } });

/* busca livre: tarja qualquer termo digitado, além do que foi reconhecido */
$('sform').onsubmit = async e => { e.preventDefault(); const t = $('sq').value.trim(); if (!t) return;
  if (!state.pages.length) return status('Abra um PDF primeiro.');
  const btn = $('sgo'); btn.disabled = true;
  try { const ms = await findAll(t, { contains: $('scont').checked }, status), n = addMatches(ms, 'busca', state.fx === 'blur' ? 'blur' : undefined); refresh();
    status(ms.length ? `“${t}”: ${ms.length} ocorrência(s) encontrada(s), ${n} nova(s) tarja(s)${ms.length - n ? ` (${ms.length - n} já cobertas)` : ''}.` : `“${t}”: nenhuma ocorrência no documento.`); }
  catch (err) { console.error(err); status('Erro na busca: ' + err.message); }
  btn.disabled = false; };

/* controles */
$('accAll').onclick = () => bulk('pending', 'accepted');
$('rejAll').onclick = () => bulk('pending', 'rejected');
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));
document.querySelectorAll('[data-fx]').forEach(b => b.onclick = () => setFx(b.dataset.fx));
$('reveal').onchange = e => setReveal(e.target.checked);
$('zin').onclick = () => setZoom(state.zoom * 1.2); $('zout').onclick = () => setZoom(state.zoom / 1.2); $('zfit').onclick = () => setZoom(1);
document.querySelectorAll('[data-fit]').forEach(b => b.onclick = () => setFit(b.dataset.fit));
$('pprev').onclick = () => nav(-1); $('pnext').onclick = () => nav(1);
$('viewer').addEventListener('scroll', pageLabel);
new ResizeObserver(layout).observe($('viewer'));
$('exp').onclick = () => state.pdf ? exportPdf(status, $('expQ').value) : status('Abra um PDF primeiro.');
