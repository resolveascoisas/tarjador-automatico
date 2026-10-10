// Desfazer / refazer: guarda "fotos" (tarjas + palavras ignoradas). Quem muda o estado só precisa chamar refresh(); aqui se detecta a mudança.
import { state } from './state.js';
const snap = () => JSON.stringify({ h: state.hits, i: state.ignored });
let cur = null, undo = [], redo = [];
export const resetHistory = () => { cur = null; undo = []; redo = []; };
export const canUndo = () => undo.length > 0, canRedo = () => redo.length > 0;
export function track() { const s = snap(); if (cur === null) { cur = s; return; } if (s === cur) return;
  undo.push(cur); if (undo.length > 150) undo.shift(); redo = []; cur = s; }
function apply(s) { const o = JSON.parse(s); state.hits = o.h; state.ignored = o.i; cur = s; }
export function undoAct() { if (!undo.length) return false; redo.push(cur); apply(undo.pop()); return true; }
export function redoAct() { if (!redo.length) return false; undo.push(cur); apply(redo.pop()); return true; }
