export const state = { pdf: null, pages: [], hits: [], nid: 1, mode: 'toggle', enabled: {}, zoom: 1, fit: 'width', reveal: false, fx: 'black',   // fx: efeito das tarjas manuais (black | blur)
 
  ignored: {},            // palavras que o usuário mandou nunca aceitar: { chave-normalizada: texto }
  imgOn: false,           // “Incluir reconhecimento de imagem” (rostos, assinaturas, placas): desligado por padrão
  lastManual: null,       // última tarja manual criada (mostra lixeira e “Todos” ao lado dela)
  docKey: null, docName: '', hasRec: false };
