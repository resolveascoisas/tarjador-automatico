// Painéis laterais: minimizar (botão ou duplo clique na divisória), redimensionar (arrastar) e dobrar seções (clique no título). Preferências ficam no navegador.
const KEY = 'tarjador.layout', app = document.querySelector('.app');
const cfg = { lw: 260, rw: 310, lc: false, rc: false };
try { Object.assign(cfg, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch {} };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function apply() {
  app.style.setProperty('--lcol', (cfg.lc ? 40 : cfg.lw) + 'px'); app.style.setProperty('--rcol', (cfg.rc ? 40 : cfg.rw) + 'px');
  app.classList.toggle('lc', cfg.lc); app.classList.toggle('rc', cfg.rc);
  document.querySelector('[data-p=left]').textContent = cfg.lc ? '»' : '«'; document.querySelector('[data-p=right]').textContent = cfg.rc ? '«' : '»';
}
export function initLayout() {
  apply();
  const toggle = left => { const k = left ? 'lc' : 'rc'; cfg[k] = !cfg[k]; apply(); save(); };
  document.querySelectorAll('[data-p]').forEach(b => b.onclick = () => toggle(b.dataset.p === 'left'));
  document.querySelectorAll('.split').forEach(s => { const left = s.dataset.s === 'l';
    s.ondblclick = () => toggle(left);
    s.onpointerdown = e => { if (cfg[left ? 'lc' : 'rc']) return; s.setPointerCapture(e.pointerId); s.classList.add('drag'); document.body.style.userSelect = 'none';
      s.onpointermove = ev => { const r = app.getBoundingClientRect(); if (left) cfg.lw = clamp(ev.clientX - r.left, 190, 520); else cfg.rw = clamp(r.right - ev.clientX, 210, 560); apply(); };
      s.onpointerup = () => { s.onpointermove = s.onpointerup = null; s.classList.remove('drag'); document.body.style.userSelect = ''; save(); }; }; });
  document.querySelectorAll('aside h2').forEach(h => h.onclick = () => h.parentElement.classList.toggle('closed'));
}
