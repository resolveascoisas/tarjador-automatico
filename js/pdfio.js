export const SCALE = 2, EXPORT_SCALE = 3;
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
export async function openPdf(file, onProg) {
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise, pages = [];
  for (let n = 1; n <= pdf.numPages; n++) { const page = await pdf.getPage(n), vp = page.getViewport({ scale: SCALE });
    const canvas = document.createElement('canvas'); canvas.width = vp.width; canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    pages.push({ n, page, canvas, W: vp.width, H: vp.height, words: null }); onProg(n, pdf.numPages); }
  return { pdf, pages };
}
// Caixa de cada palavra = corpo inteiro da fonte (da altura das maiúsculas até os descendentes), qualquer que seja o tamanho do texto.
async function textWords(p) {
  const vp = p.page.getViewport({ scale: SCALE }), tc = await p.page.getTextContent(), out = [];
  for (const it of tc.items) { if (!it.str || !it.str.trim()) continue;
    const t = pdfjsLib.Util.transform(vp.transform, it.transform), h = Math.hypot(t[2], t[3]), w = it.width * SCALE, len = it.str.length, re = /\S+/g; let m;
    while ((m = re.exec(it.str))) out.push({ t: m[0], x: t[4] + w * m.index / len, y: t[5] - h * 0.88, w: w * m[0].length / len, h: h * 1.12 }); }
  return out;
}
let worker = null;
export async function ocrCanvas(cv, status) {
  if (!worker) worker = await Tesseract.createWorker('por', 1, { logger: m => m.status && status(`OCR: ${m.status} ${Math.round((m.progress || 0) * 100)}%`) });
  const r = await worker.recognize(cv);
  return (r.data.words || []).filter(w => w.text.trim()).map(w => ({ t: w.text, x: w.bbox.x0, y: w.bbox.y0, w: w.bbox.x1 - w.bbox.x0, h: w.bbox.y1 - w.bbox.y0, c: w.confidence }));
}
export async function readWords(p, mode, status) {
  p.ocr = false; let w = mode === 'always' ? [] : await textWords(p);
  if (mode === 'always' || (mode === 'auto' && w.map(x => x.t).join('').length < 15)) { w = await ocrCanvas(p.canvas, status); p.ocr = true; }
  return w;
}
// Retângulos (em px do canvas da página) onde o PDF desenha imagens/carimbos: percorre a lista de operadores acompanhando a matriz de transformação.
export async function imageRects(p) {
  const O = pdfjsLib.OPS, ops = await p.page.getOperatorList(), T = pdfjsLib.Util.transform;
  const IMG = new Set([O.paintImageXObject, O.paintInlineImageXObject, O.paintImageMaskXObject, O.paintJpegXObject].filter(x => x !== undefined));
  let m = p.page.getViewport({ scale: SCALE }).transform.slice(); const st = [], out = [];
  ops.fnArray.forEach((fn, i) => { const a = ops.argsArray[i];
    if (fn === O.save) st.push(m); else if (fn === O.restore) m = st.pop() || m;
    else if (fn === O.transform) m = T(m, a);
    else if (fn === O.paintFormXObjectBegin) { st.push(m); if (a && a[0]) m = T(m, a[0]); } else if (fn === O.paintFormXObjectEnd) m = st.pop() || m;
    else if (IMG.has(fn)) { const xs = [], ys = []; [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([u, v]) => { xs.push(m[0] * u + m[2] * v + m[4]); ys.push(m[1] * u + m[3] * v + m[5]); });
      const x0 = Math.max(0, Math.min(...xs)), y0 = Math.max(0, Math.min(...ys)), x1 = Math.min(p.W, Math.max(...xs)), y1 = Math.min(p.H, Math.max(...ys));
      if (x1 - x0 >= 40 && y1 - y0 >= 40) out.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }); } });
  return out;
}
