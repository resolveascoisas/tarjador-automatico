// Categorias de detecção. kind: dict (palavras) | phrase (frases) | regex (padrões)
// Para regex: ctx=true => o valor a tarjar é o grupo 1 (precedido de palavra-chave); chk => 'sure' | 'doubt' | null
const dg = s => s.replace(/\D/g, '');
export const cpfOk = s => { const d = dg(s); if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  for (const n of [9, 10]) { let t = 0; for (let i = 0; i < n; i++) t += +d[i] * (n + 1 - i); if ((t * 10) % 11 % 10 !== +d[n]) return false; } return true; };
export const cnpjOk = s => { const d = dg(s); if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const f = n => { let w = n - 7, t = 0; for (let i = 0; i < n; i++) { t += +d[i] * w--; if (w < 2) w = 9; } const r = t % 11; return r < 2 ? 0 : 11 - r; };
  return f(12) === +d[12] && f(13) === +d[13]; };
export const luhn = s => { let t = 0, alt = false; for (let i = s.length - 1; i >= 0; i--) { let n = +s[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } t += n; alt = !alt; } return t % 10 === 0; };

export const GROUPS = { img: 'Reconhecimento de imagem (borrar)', pessoas: 'Pessoas', docs: 'Documentos de identificação', contato: 'Contato', end: 'Endereço e localização', fin: 'Financeiro, veículos e jurídico', outros: 'Outros' };
export const WORDS_V = 2;   // versão da geometria das palavras salvas (muda quando o cálculo das caixas muda)
const L = (id, label, group, conf = 'sure', o = {}) => ({ id, label, group, kind: o.kind || 'phrase', conf, ...o });
const R = (id, label, group, re, o = {}) => ({ id, label, group, kind: 'regex', re, ...o });

export const CATS = [
  L('nomes', 'Nomes próprios', 'pessoas', 'sure', { kind: 'dict' }),
  L('sobrenomes', 'Sobrenomes', 'pessoas', 'sure', { kind: 'dict' }),
  L('titulos', 'Pronomes de tratamento + nome (PT/EN)', 'pessoas', 'sure', { kind: 'titles' }),
  R('nascimento', 'Data de nascimento (com contexto)', 'pessoas', /\b(?:nascid[oa]|nascimento|nasc\.?|DN|date of birth|DOB|born(?: on)?)\b[^\d]{0,25}(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/gid, { ctx: true }),
  R('data', 'Qualquer data (dd/mm/aaaa)', 'pessoas', /(?<!\d)\d{1,2}\/\d{1,2}\/\d{2,4}(?!\d)/gd, { conf: 'doubt', off: true }),

  R('cpf', 'CPF', 'docs', /(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)/gd, { chk: v => cpfOk(v) ? 'sure' : /[.-]/.test(v) ? 'doubt' : null }),
  R('cnpj', 'CNPJ', 'docs', /(?<!\d)\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}(?!\d)/gd, { chk: v => cnpjOk(v) ? 'sure' : /[./-]/.test(v) ? 'doubt' : null }),
  R('rg', 'RG', 'docs', /(?<!\d)\d{1,2}\.\d{3}\.\d{3}-?[\dXx](?![\w])/gd),
  R('rg_ctx', 'RG (com contexto)', 'docs', /\b(?:RG|identidade)\b[^\d]{0,20}(\d[\d.\-]{4,12}[\dXx])(?!\d)/gid, { ctx: true }),
  R('cnh', 'CNH', 'docs', /\b(?:CNH|habilita[cç][aã]o)\b[^\d]{0,20}(\d{9,11})(?!\d)/gid, { ctx: true }),
  R('titulo', 'Título de eleitor', 'docs', /\b(?:t[ií]tulo(?: de eleitor)?|eleitor)\b[^\d]{0,20}(\d{4}\s?\d{4}\s?\d{4})(?!\d)/gid, { ctx: true }),
  R('pis', 'PIS / PASEP / NIS', 'docs', /(?<!\d)\d{3}\.\d{5}\.\d{2}-\d(?!\d)/gd),
  R('pis_ctx', 'PIS / NIT (com contexto)', 'docs', /\b(?:PIS|PASEP|NIS|NIT)\b[^\d]{0,15}(\d{3}\.?\d{5}\.?\d{2}-?\d)/gid, { ctx: true }),
  R('ctps', 'CTPS', 'docs', /\bCTPS\b[^\d]{0,20}(\d{5,8})(?!\d)/gid, { ctx: true }),
  R('sus', 'Cartão SUS', 'docs', /\b(?:SUS|CNS|cart[aã]o nacional de sa[uú]de)\b[^\d]{0,20}(\d{3}\s?\d{4}\s?\d{4}\s?\d{4})(?!\d)/gid, { ctx: true }),
  R('ssn', 'Social Security Number (EUA)', 'docs', /(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)/gd),
  R('passaporte_ctx', 'Passaporte / passport (com contexto)', 'docs', /\b(?:passaporte|passport)(?: n(?:o|º|umber)?\.?)?\b[^A-Z0-9]{0,15}([A-Z]{0,2}\d{6,8})(?![A-Z0-9])/gid, { ctx: true }),
  R('passaporte', 'Passaporte (formato BR)', 'docs', /(?<![A-Z0-9])[A-Z]{2}\d{6}(?![A-Z0-9])/gd, { conf: 'doubt' }),

  R('email', 'E-mail', 'contato', /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gd),
  R('telefone', 'Telefone', 'contato', /(?<!\d)(?:\+55\s?)?(?:\(\d{2}\)\s?|\d{2}\s)?9?\d{4}-\d{4}(?!\d)/gd, { chk: v => /[(+]|^\d{2}\s/.test(v) ? 'sure' : 'doubt' }),
  R('telefone_us', 'Telefone (EUA)', 'contato', /(?<!\d)(?:\+1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)/gd, { chk: v => /[(+]/.test(v) ? 'sure' : 'doubt' }),
  R('url', 'Links e sites', 'contato', /\b(?:https?:\/\/|www\.)[^\s<>"')]+/gid),
  R('social', 'Perfis de rede social (@usuario)', 'contato', /(?<![\w@.])@[A-Za-z0-9_.]{3,30}\b/gd, { conf: 'doubt' }),
  R('mac', 'Endereço MAC', 'contato', /\b(?:[0-9A-F]{2}[:-]){5}[0-9A-F]{2}\b/gid),
  R('imei', 'IMEI', 'contato', /\bIMEI\b[^\d]{0,10}(\d{15})(?!\d)/gid, { ctx: true }),
  R('ip', 'Endereço IP', 'contato', /(?<!\d)(?:\d{1,3}\.){3}\d{1,3}(?!\d)/gd, { chk: v => v.split('.').every(n => +n <= 255) ? 'doubt' : null }),

  L('logradouros', 'Logradouros (+ número)', 'end'),
  L('bairros', 'Bairros', 'end', 'doubt'),
  L('localidades', 'Cidades / localidades', 'end', 'sure'),
  L('estados', 'Estados', 'end', 'doubt', { off: true }),
  L('paises', 'Países', 'end', 'doubt', { off: true }),
  R('coord', 'Coordenadas GPS', 'end', /-?\d{1,3}\.\d{4,}\s*[,;]\s*-?\d{1,3}\.\d{4,}/gd),
  R('zip_ctx', 'ZIP / código postal (EUA)', 'end', /\b(?:ZIP|postal code)\b[^\d]{0,5}(\d{5}(?:-\d{4})?)(?!\d)/gid, { ctx: true }),
  R('cep', 'CEP', 'end', /(?<!\d)\d{5}-\d{3}(?!\d)/gd),
  R('cep_ctx', 'CEP sem hífen (com contexto)', 'end', /\bCEP\b[^\d]{0,5}(\d{8})(?!\d)/gid, { ctx: true }),

  R('cartao', 'Cartão de crédito', 'fin', /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/gd, { chk: v => { const d = dg(v); return d.length >= 13 && luhn(d) ? 'sure' : null; } }),
  R('conta', 'Agência / conta bancária', 'fin', /\b(?:ag[eê]ncia|ag\.?|conta(?: corrente| poupan[cç]a)?|c\/c)\b[^\d]{0,12}(\d{3,6}(?:-?[\dXx])?)(?![\d])/gid, { ctx: true }),
  R('pix', 'Chave Pix aleatória', 'fin', /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gid),
  R('renavam', 'RENAVAM', 'fin', /\brenavam\b[^\d]{0,15}(\d{9,11})(?!\d)/gid, { ctx: true }),
  R('processo', 'Nº de processo (CNJ)', 'fin', /(?<!\d)\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}(?!\d)/gd),
  R('oab', 'OAB', 'fin', /\bOAB[\s\/-]*[A-Z]{2}[\s:nº°.-]*\d{1,3}\.?\d{3}(?!\d)/gid),
  R('iban', 'IBAN', 'fin', /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,4})?\b/gd, { conf: 'doubt' }),
  R('valor', 'Valores em R$', 'fin', /R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{2})?/gd, { off: true }),
  R('matricula', 'Matrícula / SIAPE / RA / contrato (com contexto)', 'fin', /\b(?:matr[ií]cula|SIAPE|registro acad[eê]mico|contrato)(?: n(?:o|º)?\.?)?\b[^\d]{0,15}(\d{4,12})(?!\d)/gid, { ctx: true, conf: 'doubt' }),
  R('ie', 'Inscrição estadual / municipal (com contexto)', 'fin', /\b(?:inscri[cç][aã]o (?:estadual|municipal)|I\.?E\.?)\b[^\d]{0,15}(\d[\d.\/-]{5,16}\d)/gid, { ctx: true }),
  R('cid', 'CID (diagnóstico)', 'fin', /\bCID(?:-?10)?\b[^A-Z0-9]{0,5}([A-Z]\d{2}(?:\.\d)?)/gd, { ctx: true, conf: 'doubt' }),
  R('crm', 'CRM', 'fin', /\bCRM[\s\/-]*[A-Z]{2}[\s:nº°.-]*\d{3,7}(?!\d)/gid),

  // Imagens: recebem efeito de borrão (fx:'blur') em vez de tarja preta. img:true = sem texto (não agrupa na lista)
  { id: 'rosto', label: 'Rostos (borrar)', group: 'img', kind: 'face', conf: 'sure', fx: 'blur', img: true },
  { id: 'assinatura', label: 'Assinaturas (borrar)', group: 'img', kind: 'sign', conf: 'doubt', fx: 'blur', img: true },
  R('placa', 'Placa de veículo (borrar)', 'img', /(?<![A-Z0-9])[A-Z]{3}-?\d[A-Z0-9]\d{2}(?![A-Z0-9])/gd, { conf: 'doubt', fx: 'blur' }),

  L('organizacoes', 'Empresas e instituições', 'outros', 'doubt'),
];
export const CSV_CATS = CATS.filter(c => ['dict', 'phrase', 'titles'].includes(c.kind)).map(c => c.id);
export const AUX_CSV = ['tipos_logradouro'];
export const IMG_CATS = new Set(CATS.filter(c => c.group === 'img').map(c => c.id));   // só rodam com “Incluir reconhecimento de imagem” ligado
