import { state } from './state.js';
import { SCALE } from './pdfio.js';
// Resolução (× o tamanho do PDF em pontos; 2 ≈ 144 dpi) e qualidade JPEG de cada opção de tamanho
const PRESETS = { alta: { scale: 3, q: 0.9 }, eq: { scale: 2, q: 0.75 }, min: { scale: 1.5, q: 0.6 } };
const fmt = n => n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
// Borrão irreversível: a região vira um mosaico (média de blocos) e depois é suavizada; os pixels originais deixam de existir no PDF final.
function blurBox(c, ctx, b) {
  const x = Math.max(0, Math.round(b.x)), y = Math.max(0, Math.round(b.y)), w = Math.min(c.width - x, Math.round(b.w)), h = Math.min(c.height - y, Math.round(b.h)); if (w < 2 || h < 2) return;
  const cell = Math.max(4, Math.round(Math.min(w, h) / 5)), tw = Math.max(1, Math.ceil(w / cell)), th = Math.max(1, Math.ceil(h / cell));
  const t = document.createElement('canvas'); t.width = tw; t.height = th; const tx = t.getContext('2d'); tx.imageSmoothingQuality = 'high'; tx.drawImage(c, x, y, w, h, 0, 0, tw, th);
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.imageSmoothingEnabled = false; ctx.drawImage(t, 0, 0, tw, th, x, y, tw * cell, th * cell); ctx.imageSmoothingEnabled = true;
  try { if ('filter' in ctx) { ctx.filter = `blur(${cell * 0.6}px)`; ctx.drawImage(c, x, y, w, h, x, y, w, h); } } catch {}
  ctx.restore(); }
// O PDF final é rasterizado: o texto original sob as tarjas é removido de fato.
export async function exportPdf(status, preset = 'eq') {
  const { scale: EXPORT_SCALE, q } = PRESETS[preset] || PRESETS.eq, { jsPDF } = window.jspdf; let pdf = null;
  for (const p of state.pages) { status(`Exportando página ${p.n}/${state.pages.length}…`);
    const vp = p.page.getViewport({ scale: EXPORT_SCALE }), v1 = p.page.getViewport({ scale: 1 }), k = EXPORT_SCALE / SCALE;
    const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; const ctx = c.getContext('2d');
    await p.page.render({ canvasContext: ctx, viewport: vp }).promise;
    const acc = state.hits.filter(h => h.page === p.n && h.status === 'accepted'), sc = b => ({ x: b.x * k, y: b.y * k, w: b.w * k, h: b.h * k });
    acc.filter(h => h.fx === 'blur').forEach(h => h.boxes.forEach(b => blurBox(c, ctx, sc(b))));
    ctx.fillStyle = '#000'; acc.filter(h => h.fx !== 'blur').forEach(h => h.boxes.forEach(b => { const r = sc(b); ctx.fillRect(r.x, r.y, r.w, r.h); }));
    const o = v1.width > v1.height ? 'l' : 'p';
    if (!pdf) pdf = new jsPDF({ unit: 'pt', format: [v1.width, v1.height], orientation: o, compress: true }); else pdf.addPage([v1.width, v1.height], o);
    pdf.addImage(c.toDataURL('image/jpeg', q), 'JPEG', 0, 0, v1.width, v1.height); c.width = c.height = 0; }   // libera a memória da página
  const blob = pdf.output('blob'), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'documento-tarjado.pdf'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  status(`PDF exportado — ${fmt(blob.size)}.`);
}
