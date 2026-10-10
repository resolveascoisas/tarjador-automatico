# Tarjador de PDF

1. Execute `iniciar.bat` (Windows) ou `./iniciar.sh` (Linux/macOS) — requer Python 3 — e abra http://localhost:8000. Requer internet (pdf.js, jsPDF e Tesseract via CDN).

## Listas (CSV) e backend
A interface não expõe CSVs. As listas são buscadas em `js/settings.js` (`fetchList`); por padrão lê `data/<id>.csv`.
Troque a função por uma chamada ao seu backend (ids: nomes, sobrenomes, titulos, logradouros, tipos_logradouro, bairros, localidades, estados, paises, organizacoes).
O retorno é texto CSV: um item por linha (primeira coluna; cabeçalho opcional). Se for só usar o backend, pode apagar a pasta `data/`.

## Estrutura
- `js/config.js` — categorias e expressões regulares. Nova lista: `L('id','Rótulo','grupo')` + id no backend.
- `js/detect.js` — regras e confiança (certo × dúvida) · `js/pdfio.js` — PDF e OCR · `js/ui.js` — revisão/edição · `js/export.js` — PDF final.

O PDF exportado é rasterizado: o texto sob as tarjas é removido de verdade.

## Painéis
Os painéis laterais podem ser minimizados (botão «/» ou duplo clique na divisória), redimensionados arrastando a divisória, e cada seção dobra ao clicar no título. As preferências ficam salvas no navegador. O PDF abre ajustado à largura da área central (botões "Largura" e "Página" na barra).

## Revisão
- Passe o mouse sobre 👍/🗑 para ver “Aceitar tarja de …” / “Não aceitar tarja de …”.
- Sobre o documento, **segure** a lixeira (~0,5 s) para abrir “Não aceitar para todos os casos em que essa palavra apareça”. A palavra fica ignorada também em novas análises do documento.
- Na lista, ocorrências iguais aparecem aglutinadas (`×N`); like/lixeira agem em todas de uma vez e clicar na linha percorre as ocorrências.
- Conjunções/preposições/artigos (de, da, do, na, no, por, para…) nunca são tarjados sozinhos (lista `STOP` em `js/detect.js`); só ficam cobertos quando estão no meio de um nome composto (“Maria da Silva”).

## Progresso salvo
Tudo (tarjas aceitas/rejeitadas/manuais, palavras ignoradas, categorias, texto lido/OCR) é salvo automaticamente no IndexedDB do navegador, por documento (identificado pelo hash do arquivo). Ao reabrir o mesmo PDF o progresso é restaurado; reanalisar preserva suas decisões. “Apagar progresso salvo deste documento” fica na coluna da esquerda.

## Borrar (rostos, assinaturas, placas) e tamanho da fonte
- Grupo **Imagens (borrar)** na coluna da esquerda: *Rostos*, *Assinaturas* e *Placa de veículo*. Essas ocorrências recebem **borrão** (mosaico + desfoque, irreversível no PDF exportado) em vez de tarja preta. Rostos e assinaturas vêm desmarcados por padrão.
- Rostos: detector BlazeFace (MediaPipe), baixado na 1ª vez que a opção é usada (precisa de internet); só procura dentro das imagens da página, em janelas sobrepostas.
- Assinaturas: heurística — tinta manuscrita que não é texto reconhecido, sem linhas/tabelas, com formato alongado. Fica como *dúvida* (revisar); vira *certo* quando há “Assinatura/Assinado/Testemunha…” por perto.
- Placas: texto no padrão de placa (antigo e Mercosul) + OCR dentro das imagens da página.
- Para qualquer outro caso, use o seletor **▮ Tarja / ◍ Borrar** na barra e os modos *Desenhar* / *Palavra*.
- As caixas das tarjas acompanham o corpo da fonte (folga proporcional), então cobrem letras miúdas e títulos grandes; tarjas manuais pequenas (a partir de ~3 px) também são aceitas.

### Detecção de rostos e assinaturas (v2)
- Rostos: varredura da página inteira e de cada imagem, em 3 escalas (0,5×, 1×, 2×) com janelas sobrepostas — acha rostos grandes, médios e pequenos (3x4, crachá). Detecções repetidas são fundidas; concordância entre passadas ou nota ≥ 0,65 = *certo*, senão *dúvida*.
- Assinaturas: limiar de tinta local (funciona em scan com fundo cinza/sombra e caneta clara), preserva traços finos, descarta texto, tabelas, carimbos cheios e fotos grandes; imagens pequenas e ralas coladas no PDF viram candidatas. *Certo* quando há linha curta logo abaixo (ou “____” no texto) ou palavra como Assinatura/Rubrica/Testemunha por perto; senão *dúvida*.

### Incluir reconhecimento de imagem
Primeiro item do filtro, **desmarcado por padrão**. Ligado, passam a valer as opções do grupo “Reconhecimento de imagem (borrar)” (rostos, assinaturas, placas); desligado, o grupo fica apagado e nada de imagem é processado nem baixado. A escolha é salva por documento.
