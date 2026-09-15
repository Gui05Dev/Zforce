# Z-Force Mobilidade Elétrica

Site institucional em HTML, CSS e JavaScript puros (sem framework), empacotado com
[Vite](https://vite.dev) para carregar as bibliotecas de animação sob demanda.

> **Antes de publicar:** a seção "Resultados reais" ainda usa imagens provisórias
> de desenvolvimento. Veja [Fotos da seção "Resultados reais"](#fotos-da-seção-resultados-reais).

## Rodar

```bash
npm install
npm run dev        # desenvolvimento em http://localhost:5173 (com HMR)
npm run build      # gera dist/
npm run preview    # serve dist/ em http://localhost:4173
```

## Qualidade

```bash
npm run lint       # ESLint
npm test           # testes unitários (node:test): ambiente, imagens, diagnóstico e modelos
npm run test:e2e   # Playwright no Chrome instalado (headless): layouts, console, menu, âncoras,
                   # ScrollSmoother, comparador, PhotoSwipe, diagnóstico, reduced-motion, sem WebGL, sem JS
npm run test:gpu   # janela do Chrome com a GPU da máquina: fundo 3D, patinete do hero e diagnóstico 3D
npm run model:build        # regenera os GLB otimizados (hero e diagnóstico) a partir do modelo original
npm run diagnostic:poster  # regenera a imagem de fallback do diagnóstico e as posições dos pontos nela
```

## Publicação
**GitHub Pages (automático):** cada push na `main` roda `.github/workflows/deploy.yml`
(instala, lint, testes unitários, build) e publica a pasta `dist/`. Configuração única no
repositório: *Settings → Pages → Build and deployment → Source: GitHub Actions*. Site:
https://gui05dev.github.io/Zforce/

Os caminhos são relativos, então o `dist/` também funciona na raiz de outro domínio.
Em Netlify/Vercel: comando `npm run build`, pasta `dist`.

## Seções

| Nº | Seção | id |
| --- | --- | --- |
| 00 | Hero | `#inicio` |
| 01 | Serviços | `#servicos` |
| 02 | Resultados reais (antes/depois + galeria) | `#resultados` |
| 03 | Diagnóstico interativo + como funciona o atendimento | `#como-funciona` |
| 04 | Sobre | `#sobre` |
| 05 | Contato | `#contato` |

## Animações e interação: uma biblioteca por responsabilidade

| Módulo | Biblioteca | Controla |
| --- | --- | --- |
| `js/modules/smoothScroll.js` | GSAP ScrollSmoother 3.15 | Rolagem suave no desktop, `data-speed`/`data-lag` decorativos, âncoras abaixo do topo fixo |
| `js/modules/gsapScrollAnimations.js` | GSAP 3.15 + ScrollTrigger + SplitText | Entrada do hero, revelações (inclusive dos blocos do diagnóstico), feixes, barra de progresso, gatilhos das seções |
| `js/modules/threeHeroScene.js` | Three.js 0.186 | Fundo do hero (import dinâmico) e loop único de renderização |
| `js/modules/threeScooter.js` | Three.js 0.186 (GLTFLoader + meshopt) | Patinete 3D que substitui o desenho no desktop (import dinâmico) |
| `js/modules/motionInteractions.js` | Motion 13 | Botões, cards, menu mobile, indicador do menu, WhatsApp flutuante, indicador de rolagem |
| `js/modules/animeCounters.js` | Anime.js 4.5 | Desenho técnico do hero e contadores |
| `js/modules/interactiveDiagnostic.js` | Motion 13 | Diagnóstico: seleção, troca do card, sintomas, WhatsApp, carregamento sob demanda e fallback |
| `js/modules/scooterViewer.js` | Three.js 0.186 (GLTFLoader, OrbitControls, meshopt) | Diagnóstico: modelo, câmera, luzes, controles e posição dos pontos (import dinâmico) |
| `js/data/diagnostic.js` | — | **Fonte única** do diagnóstico: pontos 3D, sintomas, mensagens, etapas e caminhos do modelo |
| `js/data/contact.js` | — | **Fonte única** do número de WhatsApp para links gerados por código |
| `js/modules/comparisonSlider.js` | img-comparison-slider 8.0.7 | Divisor antes/depois (mouse, toque, teclado) — import dinâmico |
| `js/modules/gallery.js` | PhotoSwipe 5.4.4 | Lightbox, zoom, gestos — import dinâmico; núcleo só ao abrir |
| `js/data/results.js` | — | **Fonte única** dos dados e imagens de "Resultados reais" |
| `js/modules/env.js` | — | Movimento reduzido, celular, aparelho fraco, WebGL |
| `js/main.js` | — | Ordem de inicialização, ligação entre módulos, limpeza no HMR |

Regras:
- Um elemento nunca tem a mesma propriedade animada por duas bibliotecas. Ex.: o GSAP
  revela o `<figure>` do comparador, o img-comparison-slider move o divisor, o Motion
  anima o botão "Ver imagens ampliadas" e o PhotoSwipe só assume com o lightbox aberto.
- O ScrollSmoother é criado antes de qualquer ScrollTrigger. Não é criado com
  `prefers-reduced-motion` nem em aparelhos só de toque (rolagem nativa).
- Topo, WhatsApp flutuante e o modal do PhotoSwipe ficam **fora** de `#smooth-content`.
- `data-speed`/`data-lag` só em elementos decorativos (fundo 3D, feixes, desenho técnico).
- Sem JavaScript, com `prefers-reduced-motion` ou se algum módulo falhar, todo o conteúdo
  fica visível no estado final. Sem WebGL, o hero usa o fundo em CSS.

## Diagnóstico interativo (seção 03, `#como-funciona`)

Substitui a antiga timeline vertical. O visitante gira o modelo 3D do patinete (arrastando), escolhe
um componente (ponto no modelo ou lista de botões), marca o sintoma e abre o WhatsApp com a
mensagem pronta. Abaixo, uma faixa compacta com as quatro etapas do atendimento.

- **Configuração:** tudo em `js/data/diagnostic.js` (pontos, sintomas, textos, mensagem, etapas).
  O HTML da seção é gerado a partir dele no build, então sem JavaScript os cinco componentes,
  sintomas, links e etapas continuam legíveis.
- **Modelo:** original em `public/assets/models/xiaomi-scooter/` (`scene.gltf`, `scene.bin`,
  `textures/`, `license.txt`), servido em `/assets/models/xiaomi-scooter/scene.gltf`. O visualizador
  carrega primeiro `scene-otimizado.glb` (885 KB, mesmas coordenadas, texturas preservadas, sem o
  símbolo do fabricante) e, se ele falhar, o `scene.gltf` original.
- **Carregamento:** só quando a seção chega a ~500 px da tela (IntersectionObserver), com indicador
  de progresso. Shaders compilados em paralelo e malha decodificada em workers, para não travar a rolagem.
- **Controles:** OrbitControls sem pan e sem zoom (a roda do mouse rola a página), ângulo vertical
  limitado (nunca de cabeça para baixo) e autorrotação lenta até a primeira interação. No toque, só
  gira na horizontal (`touch-action: pan-y`): o arraste vertical rola a página.
- **Desempenho:** DPR ≤ 1,5; loop pausado fora da tela e com a aba oculta; parado, não desenha nada;
  sem sombras reais, pós-processamento ou mapa de ambiente (a sombra é um gradiente).
- **Imagem ilustrativa** (`assets/diagnostico/patinete-diagnostico.webp`, renderizada do próprio
  modelo por `npm run diagnostic:poster`): usada sem WebGL, com economia de dados, em aparelho muito
  limitado ou se o modelo não carregar. Os pontos e o card continuam funcionando.
- **Acessibilidade:** pontos e lista são `<button aria-pressed>`; o card oculto é `inert`; há
  descrição textual do modelo; o estado selecionado mostra o nome (não depende só da cor); com
  movimento reduzido, sem autorrotação nem animações contínuas.

### Limitação do mapeamento das peças

As malhas do modelo têm nomes genéricos (`Object_2`…) e o exportador fundiu peças diferentes na
mesma malha por material. Por isso **nenhum ponto está ligado a uma malha**: cada um é uma
coordenada 3D escolhida pela geometria e conferida em renderização. Os pontos indicam a **região**
do componente (por exemplo, "Energia e bateria" no deck, onde fica a bateria), não a peça isolada, e
o modelo não permite destacar uma peça sozinha. Ao ajustar `posicao` ou `vistaInicial`, rode
`npm run diagnostic:poster` para atualizar a imagem e as posições `poster`.

## Patinete 3D do hero

No desktop, o desenho técnico do patinete (SVG animado pelo Anime.js) se desenha como antes e,
ao terminar, **se transforma no modelo 3D**: surge na mesma vista lateral, é "desenhado" da
traseira para a frente, gira para 3/4, oscila devagar e reage ao mouse. Os nomes das peças saíram
do hero (SVG e 3D) para não repetir o Diagnóstico interativo; o desenho mantém só os pontos de inspeção.

- **Celular/tablet, sem WebGL, aparelho fraco ou `prefers-reduced-motion`:** fica só o desenho SVG
  e o modelo nem é baixado.
- **Mesmo canvas e mesmo loop do fundo 3D** (viewport + scissor sobre a área do SVG); pausa fora da
  tela e com a aba oculta. Se o WebGL cair, o SVG volta.
- **Acessibilidade:** o `<svg role="img">` com a descrição continua no DOM.

### Modelo e licença

- Original: **"2022 Xiaomi Mi Scooter"**, de **tonielpro520** (Sketchfab), licença
  **CC BY 4.0** (uso comercial permitido com crédito). Arquivos originais e `license.txt` em
  `public/assets/models/xiaomi-scooter/` (usados pelo hero e pelo diagnóstico). O modelo é
  meramente ilustrativo e não indica parceria com a Xiaomi.
- O crédito exigido está no rodapé do site. **Não remova** enquanto o modelo for usado.
- Modificações (feitas por `scripts/optimize-scooter.mjs`): texturas descartadas, símbolo do
  fabricante removido do deck, acabamento técnico (corpo grafite, arestas claras, destaques em
  laranja), malha simplificada e comprimida.

### Otimização (`npm run model:build`)

| | Original | `assets/models/patinete-zforce.glb` |
| --- | --- | --- |
| Tamanho | 8,6 MB + texturas | ~673 KB (meshopt + quantização) |
| Triângulos | 105 mil | 42 mil + 40 mil segmentos de aresta pré-calculados |
| Materiais / primitivas | 21 / 36 | 2 / 4 |

O mesmo comando gera `public/assets/models/xiaomi-scooter/scene-otimizado.glb` para o diagnóstico
(9 MB → 885 KB, 105 mil → 62 mil triângulos, texturas mantidas).

Para trocar o modelo: substitua os arquivos em `public/assets/models/xiaomi-scooter/`, ajuste a
caixa `LOGO` em `scripts/model-shared.mjs` se houver marca, rode `npm run model:build` e
`npm run diagnostic:poster`, revise os pontos em `js/data/diagnostic.js` e confira com
`npm run test:gpu`. `npm test` verifica tamanhos, texturas e arquivos.

## Fotos da seção "Resultados reais"

**Não existem, no projeto, fotos reais de antes/depois de um mesmo reparo.** O componente,
a galeria e o lightbox estão prontos, mas usam imagens provisórias marcadas como
"IMAGEM DE DESENVOLVIMENTO", e a página mostra um aviso "Em desenvolvimento".

Tudo é configurado em **`js/data/results.js`** (o HTML da seção é gerado a partir dele
no build, por um plugin em `vite.config.js`). As imagens ficam em
**`public/assets/resultados/`**.

Imagens que precisam ser substituídas:

| Arquivo | Uso | Tamanho |
| --- | --- | --- |
| `reparo-exemplo-01-antes-1200.webp` | Comparador (lado "antes") | 1200 × 800 |
| `reparo-exemplo-01-antes-1920.webp` | Lightbox (lado "antes") | 1920 × 1280 |
| `reparo-exemplo-01-depois-1200.webp` | Comparador (lado "depois") | 1200 × 800 |
| `reparo-exemplo-01-depois-1920.webp` | Lightbox (lado "depois") | 1920 × 1280 |
| `galeria-exemplo-01-640.webp` … `galeria-exemplo-04-640.webp` | Miniaturas | 640 × 480 |
| `galeria-exemplo-01-1600.webp` … `galeria-exemplo-04-1600.webp` | Lightbox | 1600 × 1200 |

Como trocar:
1. Use fotos **do mesmo veículo e do mesmo reparo** para o par antes/depois, com o mesmo
   enquadramento (proporção 3:2). Não combine fotos de serviços diferentes.
2. Exporte em WebP (ou AVIF) nos tamanhos da tabela. Miniaturas e imagens grandes são
   arquivos separados.
3. Em `js/data/results.js`, atualize `title`, `description`, `caption` e `alt` com
   informações verdadeiras, ajuste `width`/`height` se mudar as dimensões e troque
   `placeholder: true` por `false`. Com todos em `false`, o aviso some.
4. Rode `npm test`: ele confere se os arquivos existem e se as dimensões batem.

## WhatsApp
Todos os links apontam para `+55 45 98803-7791` e o endereço completo está
escrito direto no `index.html` (`https://wa.me/5545988037791?text=...`), para
funcionar mesmo se o JavaScript falhar.

Cada problema listado nos cards de serviço abre o WhatsApp com uma mensagem
própria. Para mudar uma mensagem, gere o texto com
`encodeURIComponent("sua mensagem")` no console do navegador e troque o valor
depois de `text=`.

## Números da seção "Sobre"
Não há estatísticas de clientes. Os números vêm do próprio conteúdo do site
(3 tipos de veículo, 8 problemas listados, 4 etapas, orçamento aprovado antes de
todo conserto). Se a Z-Force tiver dados reais, troque `data-count` e o texto
`sr-only` correspondente em `index.html`.

## O que falta (conteúdo real)
- **Fotos reais** para "Resultados reais" (acima) e, se possível, da oficina e da equipe.
- Endereço completo e horário de atendimento, se houver ponto físico.
- O patinete 3D é um modelo genérico de mercado (sem marca visível): uma foto ou modelo dos
  veículos realmente atendidos reforçaria a identidade.
- Logotipo: `assets/zforce-mark.webp` usa ciano/limão; uma versão alinhada ao
  laranja deixaria a identidade mais coesa. `assets/zforce-logo-animated.svg`
  não é usado no site.
