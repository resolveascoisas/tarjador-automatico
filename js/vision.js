// Detecção em imagens (tudo no navegador): rostos, assinaturas manuscritas e placas dentro de fotos. Todos recebem efeito de borrão.
import { state } from './state.js';
import { CATS } from './config.js';
import { imageRects, ocrCanvas } from './pdfio.js';

const mk = (p, cat, text, conf, box, extra = {}) => state.hits.push({ id: state.nid++, page: p.n, cat, text, conf, status: conf === 'sure' ? 'accepted' : 'pending', boxes: [box], fx: 'blur', ...extra });
const inside = (p, b) => state.hits.some(h => h.page === p.n && h.status !== 'rejected' && h.boxes.some(x => { const cx = b.x + b.w / 2, cy = b.y + b.h / 2; return cx > x.x && cx < x.x + x.w && cy > x.y && cy < x.y + x.h; }));
const clamp = (p, b) => { const x = Math.max(0, b.x), y = Math.max(0, b.y); return { x, y, w: Math.min(p.W - x, b.w - (x - b.x)), h: Math.min(p.H - y, b.h - (y - b.y)) }; };

/* ---------- rostos (MediaPipe BlazeFace, carregado sob demanda) ---------- */
const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
let det = null, detFail = false;
async function faceDetector(status) {
  if (det || detFail) return det;
  try { status('Carregando detector de rostos (primeira vez)…');
    const m = await import(MP + '/vision_bundle.mjs'), fs = await m.FilesetResolver.forVisionTasks(MP + '/wasm');
    const d = await m.FaceDetector.createFromOptions(fs, { baseOptions: { modelAssetPath: MODEL }, runningMode: 'IMAGE', minDetectionConfidence: 0.35 });
    det = cv => d.detect(cv).detections.map(x => ({ x: x.boundingBox.originX, y: x.boundingBox.originY, w: x.boundingBox.width, h: x.boundingBox.height, s: x.categories[0] ? x.categories[0].score : 0.5 })); }
  catch (e) { console.warn('detector de rostos', e); detFail = true; status('Não foi possível carregar o detector de rostos (precisa de internet). Use “Borrar” + Desenhar.'); }
  return det;
}
const iou = (a, b) => { const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); if (w <= 0 || h <= 0) return 0;
  const i = w * h; return Math.max(i / (a.w * a.h + b.w * b.h - i), i / Math.min(a.w * a.h, b.w * b.h) * 0.8); };
// funde detecções repetidas (várias janelas/escalas); n = quantas passadas concordaram — concordância eleva a confiança
const nms = arr => { const keep = []; arr.sort((a, b) => b.s - a.s).forEach(f => { const k = keep.find(k => iou(k, f) > 0.4); if (k) k.n++; else keep.push({ ...f, n: 1 }); }); return keep; };

/* ---------- rostos: página inteira + cada imagem, em várias escalas e janelas sobrepostas ---------- */
const starts = (len, T, step) => { if (len <= T) return [0]; const a = []; for (let s = 0; s + T < len; s += step) a.push(s); a.push(len - T); return a; };
async function faces(p, rects, detect) {
  const IN = 480, out = [], tc = document.createElement('canvas'), tx = tc.getContext('2d', { willReadFrequently: true });
  const pageA = p.W * p.H, full = { x: 0, y: 0, w: p.W, h: p.H };
  const run = (sx, sy, sw, sh, sc) => { tc.width = Math.max(1, Math.round(sw * sc)); tc.height = Math.max(1, Math.round(sh * sc)); tx.fillStyle = '#fff'; tx.fillRect(0, 0, tc.width, tc.height);
    tx.drawImage(p.canvas, sx, sy, sw, sh, 0, 0, tc.width, tc.height);
    let r = []; try { r = detect(tc); } catch (e) { console.warn(e); }
    r.forEach(f => out.push({ x: sx + f.x / sc, y: sy + f.y / sc, w: f.w / sc, h: f.h / sc, s: f.s })); };
  const scan = (r, sc) => { const T = Math.round(IN / sc), step = Math.round(T * 0.66);            // janela de origem = IN/sc px; sc<1 amplia a área (rostos grandes), sc>1 acha rostos pequenos
    for (const y of starts(r.h, T, step)) for (const x of starts(r.w, T, step)) { const w = Math.min(T, r.w - x), h = Math.min(T, r.h - y); if (w >= 40 && h >= 40) run(r.x + x, r.y + y, w, h, sc); } };
  scan(full, 0.5); scan(full, 1);
  for (const r of rects) { scan(r, 0.5); scan(r, 1); scan(r, 2); }                                   // dentro das imagens: também aumentado, para rostos pequenos (3x4, crachás)
  return nms(out).filter(f => f.w >= 14 && f.h >= 14 && f.w <= p.W * 0.7 && f.h / f.w > 0.6 && f.h / f.w < 2.3);
}

/* ---------- assinaturas ---------- */
const KEY = /^(assinatura|assinado|assinada|assin\.?|ass\.?|rubrica|visto|firma|signature|signed|sign|testemunhas?|contratante|contratad[ao]|outorgante|outorgad[ao]|declarante|requerente|respons[aá]vel|atenciosamente|cordialmente)[:,.]?$/i;
const lum = (D, i) => D[i] * 0.3 + D[i + 1] * 0.59 + D[i + 2] * 0.11;
function signatures(p, rects) {
  const S = 0.5, w = Math.round(p.W * S), h = Math.round(p.H * S), n = w * h, W = p.W, H = p.H;
  const D = p.canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data, L = new Uint8Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let m = 255;                               // menor luminância do bloco 2x2: preserva traços finos de caneta
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const yy = Math.min(H - 1, 2 * y + dy), xx = Math.min(W - 1, 2 * x + dx), v = lum(D, (yy * W + xx) * 4); if (v < m) m = v; } L[y * w + x] = m; }
  // limiar local: o "fundo" de cada bloco (percentil 85) descontado, assim fundo cinza/sombra de scanner não vira tinta
  const B = 24, bx = Math.ceil(w / B), by = Math.ceil(h / B), bg = new Uint8Array(bx * by), ink = new Uint8Array(n);
  for (let j = 0; j < by; j++) for (let i = 0; i < bx; i++) { const hist = new Uint16Array(256); let c = 0;
    for (let y = j * B; y < Math.min(h, (j + 1) * B); y++) for (let x = i * B; x < Math.min(w, (i + 1) * B); x++) { hist[L[y * w + x]]++; c++; }
    let acc = 0, t = 255; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= c * 0.85) { t = v; break; } } bg[j * bx + i] = t; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const b = bg[((y / B) | 0) * bx + ((x / B) | 0)]; ink[y * w + x] = L[y * w + x] < Math.min(b - 45, 195) ? 1 : 0; }
  // apaga texto reconhecido (palavras de OCR com baixa confiança podem ser a própria assinatura)
  const lines = [];
  (p.words || []).forEach(wd => { if (/^[_.\-–—=]{6,}$/.test(wd.t)) lines.push({ x0: wd.x, x1: wd.x + wd.w, y: wd.y + wd.h * 0.6 }); if (wd.c !== undefined && wd.c < 60) return;
    const x0 = Math.max(0, Math.floor((wd.x - 3) * S)), x1 = Math.min(w - 1, Math.ceil((wd.x + wd.w + 3) * S)), y0 = Math.max(0, Math.floor((wd.y - 3) * S)), y1 = Math.min(h - 1, Math.ceil((wd.y + wd.h + 3) * S));
    for (let y = y0; y <= y1; y++) ink.fill(0, y * w + x0, y * w + x1 + 1); });
  const cand = [];
  // imagens pequenas e "ralas" (PNG/máscara de assinatura colada no PDF) viram candidatas diretas
  for (const r of rects || []) { const ra = r.w * r.h / (W * H); if (ra > 0.12 || r.w < 60 || r.h < 25) continue;
    let px = 0, x0 = w, y0 = h, x1 = 0, y1 = 0; const rx0 = Math.max(0, Math.floor(r.x * S)), rx1 = Math.min(w - 1, Math.ceil((r.x + r.w) * S)), ry0 = Math.max(0, Math.floor(r.y * S)), ry1 = Math.min(h - 1, Math.ceil((r.y + r.h) * S));
    for (let y = ry0; y <= ry1; y++) for (let x = rx0; x <= rx1; x++) if (ink[y * w + x]) { px++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, dens = px / ((rx1 - rx0 + 1) * (ry1 - ry0 + 1)); if (px >= 45 && dens >= 0.01 && dens <= 0.25 && bw / bh >= 0.8 && bw / bh <= 10) cand.push({ x: x0 / S, y: y0 / S, w: bw / S, h: bh / S, img: true }); }
  const LH = Math.round(w * 0.08), LV = Math.round(h * 0.06);                                     // apaga linhas longas (tabelas, linha de assinatura), guardando as horizontais
  for (let y = 0; y < h; y++) { let run = 0; for (let x = 0; x <= w; x++) { if (x < w && ink[y * w + x]) run++; else { if (run >= LH) { ink.fill(0, y * w + x - run, y * w + x); lines.push({ x0: (x - run) / S, x1: x / S, y: y / S }); } run = 0; } } }
  for (let x = 0; x < w; x++) { let run = 0; for (let y = 0; y <= h; y++) { if (y < h && ink[y * w + x]) run++; else { if (run >= LV) for (let k = y - run; k < y; k++) ink[k * w + x] = 0; run = 0; } } }
  const dil = (src, r, hor) => { const out = new Uint8Array(n), Ln = hor ? w : h, M = hor ? h : w, pre = new Int32Array(Ln + 1);
    for (let m = 0; m < M; m++) { for (let i = 0; i < Ln; i++) pre[i + 1] = pre[i] + src[hor ? m * w + i : i * w + m];
      for (let i = 0; i < Ln; i++) if (pre[Math.min(Ln, i + r + 1)] - pre[Math.max(0, i - r)]) out[hor ? m * w + i : i * w + m] = 1; } return out; };
  const dm = dil(dil(ink, 10, true), 4, false), seen = new Uint8Array(n), stack = new Int32Array(n), big = rects ? rects.filter(r => { const a = r.w * r.h / (W * H); return a > 0.12 && a < 0.85; }) : [];
  for (let s0 = 0; s0 < n; s0++) { if (!dm[s0] || seen[s0]) continue; let sp = 0, x0 = w, y0 = h, x1 = 0, y1 = 0, px = 0, runs = 0; stack[sp++] = s0; seen[s0] = 1;
    while (sp) { const i = stack[--sp], x = i % w, y = (i - x) / w; if (ink[i]) { px++; if (x === 0 || !ink[i - 1]) runs++; } if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && dm[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack[sp++] = i - 1; } if (x < w - 1 && dm[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack[sp++] = i + 1; }
      if (y > 0 && dm[i - w] && !seen[i - w]) { seen[i - w] = 1; stack[sp++] = i - w; } if (y < h - 1 && dm[i + w] && !seen[i + w]) { seen[i + w] = 1; stack[sp++] = i + w; } }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, dens = px / (bw * bh), asp = bw / bh, thick = px / Math.max(1, runs);          // thick: espessura média do traço (blobs/carimbos cheios são grossos)
    if (px < 45 || bw < 24 || bh < 8 || bw > w * 0.5 || bh > h * 0.15 || asp < 0.9 || asp > 10 || dens < 0.02 || dens > 0.3 || thick > 8) continue;
    const b = { x: x0 / S, y: y0 / S, w: bw / S, h: bh / S }; if (big.some(r => b.x > r.x && b.y > r.y && b.x + b.w < r.x + r.w && b.y + b.h < r.y + r.h)) continue;   // dentro de foto grande: ignora
    cand.push(b); }
  const out = []; cand.sort((a, b) => (b.img ? 1 : 0) - (a.img ? 1 : 0)).forEach(c => { if (!out.some(o => iou(o, c) > 0.3)) out.push(c); }); return { cands: out, lines };
}
const nearKeyword = (p, b) => (p.words || []).some(wd => KEY.test(wd.t) && (
  (wd.x < b.x + b.w + 60 && wd.x + wd.w > b.x - 60 && wd.y > b.y + b.h * 0.4 - 20 && wd.y < b.y + b.h + 170) ||                  // “Assinatura” logo abaixo
  (Math.abs(wd.y - b.y) < b.h && wd.x + wd.w < b.x + 20 && b.x - wd.x - wd.w < 240)));                                        // “Assinatura:” à esquerda, na mesma faixa
const onLine = (p, b, lines) => lines.some(l => { const len = l.x1 - l.x0; return len >= p.W * 0.08 && len <= p.W * 0.5 && l.y > b.y + b.h * 0.4 && l.y < b.y + b.h + 60 && Math.min(l.x1, b.x + b.w) - Math.max(l.x0, b.x) > Math.min(b.w, len) * 0.5; });   // assinatura “em cima” de uma linha curta

/* ---------- placas dentro de fotos (OCR nas imagens da página) ---------- */
async function plates(p, rects, status) {
  const re0 = CATS.find(c => c.id === 'placa').re; let k = 0;
  for (const r of [...rects].sort((a, b) => b.w * b.h - a.w * a.h)) { if (k >= 6) break;
    if (r.w < 80 || r.h < 40 || (p.ocr && r.w * r.h > 0.85 * p.W * p.H)) continue; k++;                // página inteira já passou por OCR
    const sc = Math.min(2, 1600 / Math.max(r.w, r.h)), cv = document.createElement('canvas'); cv.width = Math.round(r.w * sc); cv.height = Math.round(r.h * sc);
    cv.getContext('2d').drawImage(p.canvas, r.x, r.y, r.w, r.h, 0, 0, cv.width, cv.height); status(`Procurando placas nas imagens da página ${p.n}…`);
    const ws = (await ocrCanvas(cv, status)).map(w => ({ t: w.t.replace(/[^A-Za-z0-9-]/g, '').toUpperCase(), x: r.x + w.x / sc, y: r.y + w.y / sc, w: w.w / sc, h: w.h / sc })).filter(w => w.t);
    const text = ws.map(w => w.t).join(' '), st = []; let o = 0; ws.forEach(w => { st.push(o); o += w.t.length + 1; });
    const re = new RegExp(re0.source, 'g'); let m;
    while ((m = re.exec(text))) { const a = m.index, b = a + m[0].length, ids = []; ws.forEach((w, i) => { if (st[i] < b && st[i] + w.t.length > a) ids.push(i); });
      if (!ids.length) continue; const x0 = Math.min(...ids.map(i => ws[i].x)), y0_ = Math.min(...ids.map(i => ws[i].y)), x1 = Math.max(...ids.map(i => ws[i].x + ws[i].w)), y1 = Math.max(...ids.map(i => ws[i].y + ws[i].h)), pad = Math.max(4, (y1 - y0_) * 0.3);
      const box = clamp(p, { x: x0 - pad, y: y0_ - pad, w: x1 - x0 + 2 * pad, h: y1 - y0_ + 2 * pad }); if (!inside(p, box)) mk(p, 'placa', m[0], 'doubt', box); } }
}

export async function detectVision(p, on, status) {
  const wantF = on('rosto'), wantS = on('assinatura'), wantP = on('placa'); if (!wantF && !wantS && !wantP) return;
  let rects = []; try { rects = await imageRects(p); } catch (e) { console.warn(e); }
  if (wantF) { const detect = await faceDetector(status);
    if (detect) { status(`Procurando rostos na página ${p.n}…`);
      for (const f of await faces(p, rects, detect)) { const px = f.w * 0.18, top = f.h * 0.35, bot = f.h * 0.15;                     // folga: testa, cabelo, queixo e laterais
        mk(p, 'rosto', 'Rosto', f.s >= 0.65 || f.n >= 2 ? 'sure' : 'doubt', clamp(p, { x: f.x - px, y: f.y - top, w: f.w + 2 * px, h: f.h + top + bot }), { img: true }); } } }
  if (wantS) { status(`Procurando assinaturas na página ${p.n}…`);
    const { cands, lines } = signatures(p, rects);
    for (const b of cands) { const box = clamp(p, { x: b.x - 8, y: b.y - 8, w: b.w + 16, h: b.h + 16 }); if (inside(p, box)) continue;
      mk(p, 'assinatura', 'Assinatura', nearKeyword(p, box) || onLine(p, box, lines) ? 'sure' : 'doubt', box, { img: true }); } }
  if (wantP && rects.length) await plates(p, rects, status);
}
