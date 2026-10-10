// Origem das listas (nomes, logradouros etc.). Troque pela chamada ao seu backend, por exemplo:
//   export const fetchList = id => fetch(`/api/listas/${id}`, { credentials: 'include' }).then(r => { if (!r.ok) throw 0; return r.text(); });
// O retorno deve ser texto CSV: um item por linha (primeira coluna; cabeçalho opcional).
export const fetchList = async id => { const r = await fetch(`data/${id}.csv`); if (!r.ok) throw new Error(id); return r.text(); };
