# Z-Force Mobilidade Elétrica

Site institucional em HTML, CSS e JavaScript puros (sem framework), empacotado com
[Vite](https://vite.dev) para carregar as bibliotecas de animação sob demanda.

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
                   # ScrollSmoother, diagnóstico, reduced-motion, sem WebGL, sem JS
npm run test:gpu   # janela do Chrome com a GPU da máquina: fundo 3D, patinete do hero e diagnóstico 3D
npm run model:build        # regenera os GLB otimizados (hero e diagnóstico) a partir do modelo original
npm run diagnostic:poster  # regenera a imagem de fallback do diagnóstico e as posições dos pontos nela
npm run og:image           # regenera a imagem do card de compartilhamento (public/assets/og-zforce.jpg)
```

## Publicação
> **Configuração do Pages:** *Source* precisa estar em **GitHub Actions** (não em "Deploy from a
> branch") e o *Custom domain* em `zforce.com.br`. Servindo da branch, o site sai sem título e sem
> as seções geradas, porque o `index.html` da raiz ainda tem os marcadores `<!-- @meta -->` e
> `<!-- @diagnostic -->` por substituir.

**GitHub Pages (automático):** cada push na `main` roda `.github/workflows/deploy.yml`
(instala, lint, testes unitários, build) e publica a pasta `dist/`. Configuração única no
repositório: *Settings → Pages → Build and deployment → Source: GitHub Actions*. Site:
https://zforce.com.br/

Os caminhos são relativos, então o `dist/` também funciona na raiz de outro domínio.
Em Netlify/Vercel: comando `npm run build`, pasta `dist`.

## Compartilhamento e busca

`js/data/site.js` é a **fonte única** do endereço público e dos textos de compartilhamento. O
`<head>` do `index.html` (título, descrição, `canonical`, Open Graph, Twitter Card e o JSON-LD do
negócio) é gerado a partir dele no build, no lugar do marcador `<!-- @meta -->`; `robots.txt` e
`sitemap.xml` saem do mesmo arquivo.

**Ao trocar de domínio, mude só `url` em `js/data/site.js`.** Todo o resto acompanha — as URLs de
compartilhamento precisam ser absolutas e ficariam apontando para o endereço antigo.

- **Imagem do card** (`public/assets/og-zforce.jpg`, 1200 × 630): gerada por `npm run og:image` a
  partir de `scripts/og-image.html`, com as fontes e as cores do site. Rode de novo ao mudar a
  marca, o telefone ou a chamada principal. É JPEG de propósito: alguns leitores de link ainda não
  abrem WebP e mostrariam o link sem imagem.
- **A conferir depois de publicar:** cole o link no WhatsApp e confira o preview; valide os dados
  estruturados em [search.google.com/test/rich-results](https://search.google.com/test/rich-results).

> **Pendente:** o JSON-LD omite de propósito `openingHoursSpecification`, `geo`, `priceRange` e
> `streetAddress` — não temos esses dados confirmados, e horário errado no painel do Google é pior
> do que horário ausente. Para preencher, edite `businessJsonLd()` em `js/data/site.js`.

## Seções

| Nº | Seção | id |
| --- | --- | --- |
| 00 | Hero | `#inicio` |
| 01 | Serviços | `#servicos` |
| 02 | Diagnóstico interativo + como funciona o atendimento | `#como-funciona` |
| 03 | Sobre | `#sobre` |
| 04 | Contato | `#contato` |

## Animações e interação: uma biblioteca por responsabilidade

| Módulo | Biblioteca | Controla |
| --- | --- | --- |
| `js/modules/smoothScroll.js` | GSAP ScrollSmoother 3.15 | Rolagem suave no desktop, `data-speed`/`data-lag` decorativos, âncoras abaixo do topo fixo |
| `js/modules/gsapScrollAnimations.js` | GSAP 3.15 + ScrollTrigger + SplitText | Entrada do hero, revelações (inclusive dos blocos do diagnóstico), feixes, gatilhos das seções |
| `js/modules/threeHeroScene.js` | Three.js 0.186 | Fundo do hero (import dinâmico) e loop único de renderização |
| `js/modules/threeScooter.js` | Three.js 0.186 (GLTFLoader + meshopt) | Patinete 3D que substitui o desenho no desktop (import dinâmico) |
| `js/modules/motionInteractions.js` | Motion 13 | Botões, cards, menu mobile, indicador do menu, indicador de rolagem |
| `js/modules/animeCounters.js` | Anime.js 4.5 | Desenho técnico do hero |
| `js/modules/interactiveDiagnostic.js` | Motion 13 | Diagnóstico: seleção, troca do card, sintomas, WhatsApp, carregamento sob demanda e fallback |
| `js/modules/scooterViewer.js` | Three.js 0.186 (GLTFLoader, OrbitControls, meshopt) | Diagnóstico: modelo, câmera, luzes, controles e posição dos pontos (import dinâmico) |
| `js/data/diagnostic.js` | — | **Fonte única** do diagnóstico: pontos 3D, sintomas, mensagens, etapas e caminhos do modelo |
| `js/data/contact.js` | — | **Fonte única** do número de WhatsApp para links gerados por código |
| `js/data/site.js` | — | **Fonte única** do endereço público, textos de compartilhamento e JSON-LD (gera o `<head>` no build) |
| `js/modules/env.js` | — | Movimento reduzido, celular, aparelho fraco, WebGL |
| `js/main.js` | — | Ordem de inicialização, ligação entre módulos, limpeza no HMR |

Regras:
- Um elemento nunca tem a mesma propriedade animada por duas bibliotecas. Ex.: no
  diagnóstico o GSAP revela os blocos, o Three.js posiciona os pontos sobre o modelo e o
  Motion anima a troca do card e a resposta dos botões.
- O ScrollSmoother é criado antes de qualquer ScrollTrigger. Não é criado com
  `prefers-reduced-motion` nem em aparelhos só de toque (rolagem nativa).
- O topo fica **fora** de `#smooth-content`.
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
- **Modelo:** o site publica só `scene-otimizado.glb` (885 KB, texturas preservadas, sem o símbolo
  do fabricante) e o `license.txt`, ambos em `public/assets/models/xiaomi-scooter/`. O original
  (`scene.gltf` + `scene.bin` + `textures/`, ~9,4 MB) fica em `assets-src/models/xiaomi-scooter/`:
  versionado no Git, porque é a fonte dos scripts de otimização, mas **fora de `public/`**, então
  nunca é copiado para o `dist/`. Ele não é mais fallback do visualizador — se 885 KB não chegam,
  9,4 MB muito menos. Quando o GLB falha, a seção cai para a imagem ilustrativa (~43 KB).
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
- Quem decide é o **aparelho** (`touchOnly`: tem toque e nenhum mouse), não a largura da janela.
  Um desktop com a janela restaurada tem a mesma GPU e menos pixels para desenhar, então recebe o
  3D igual à tela cheia. Como esse sinal não muda ao redimensionar, o resultado também não depende
  do tamanho da janela no instante em que a página carregou.
- **Mesmo canvas e mesmo loop do fundo 3D** (viewport + scissor sobre a área do SVG); pausa fora da
  tela e com a aba oculta. Se o WebGL cair, o SVG volta.
- **Acessibilidade:** o `<svg role="img">` com a descrição continua no DOM.

### Modelo e licença

- Original: **"2022 Xiaomi Mi Scooter"**, de **tonielpro520** (Sketchfab), licença
  **CC BY 4.0** (uso comercial permitido com crédito). Arquivos originais em
  `assets-src/models/xiaomi-scooter/` (fonte do hero e do diagnóstico, fora do build); o
  `license.txt` é publicado junto com o site, em `public/assets/models/xiaomi-scooter/`. O modelo é
  meramente ilustrativo e não indica parceria com a Xiaomi.
- O crédito exigido está no rodapé do site. **Não remova** enquanto o modelo for usado.
- Modificações (feitas por `scripts/optimize-scooter.mjs`): texturas descartadas, símbolo do
  fabricante removido do deck, acabamento técnico (corpo grafite, arestas claras, destaques no
  verde da marca), malha simplificada e comprimida.

### Otimização (`npm run model:build`)

| | Original | `assets/models/patinete-zforce.glb` |
| --- | --- | --- |
| Tamanho | 8,6 MB + texturas | ~673 KB (meshopt + quantização) |
| Triângulos | 105 mil | 42 mil + 40 mil segmentos de aresta pré-calculados |
| Materiais / primitivas | 21 / 36 | 2 / 4 |

O mesmo comando gera `public/assets/models/xiaomi-scooter/scene-otimizado.glb` para o diagnóstico
(9 MB → 885 KB, 105 mil → 62 mil triângulos, texturas mantidas).

Para trocar o modelo: substitua os arquivos em `assets-src/models/xiaomi-scooter/`, ajuste a
caixa `LOGO` em `scripts/model-shared.mjs` se houver marca, rode `npm run model:build` e
`npm run diagnostic:poster`, revise os pontos em `js/data/diagnostic.js` e confira com
`npm run test:gpu`. `npm test` verifica tamanhos, texturas e arquivos.

## WhatsApp
Todos os links apontam para `+55 45 98803-7791` e o endereço completo está
escrito direto no `index.html` (`https://wa.me/5545988037791?text=...`), para
funcionar mesmo se o JavaScript falhar.

Cada problema listado nos cards de serviço abre o WhatsApp com uma mensagem
própria. Para mudar uma mensagem, gere o texto com
`encodeURIComponent("sua mensagem")` no console do navegador e troque o valor
depois de `text=`.

## Nada de estatística inventada
O site já teve contadores (3 tipos de veículo, 8 problemas, 4 etapas, 100%) e depois quatro
diferenciais com ícone; os dois blocos foram removidos. Os números descreviam o próprio site, não
o atendimento, e passavam por estatística sem ser. **Não invente número de clientes, de reparos
ou de anos de experiência** — sem dado verificável, uma afirmação qualitativa vale mais. Há teste
travando isso (`nenhuma estatística inventada em toda a página`).

## O que falta (conteúdo real)
- **Fotos reais** da oficina, da equipe e de reparos (antes/depois). A seção "Resultados"
  foi removida por não ter fotos verdadeiras — quando houver, vale recriá-la: o histórico do
  Git guarda a versão anterior, com comparador e lightbox.
- Endereço completo e horário de atendimento, se houver ponto físico.
- O patinete 3D é um modelo genérico de mercado (sem marca visível): uma foto ou modelo dos
  veículos realmente atendidos reforçaria a identidade.
- Logotipo: a identidade do site agora segue o ciano e o verde-limão de
  `assets/zforce-logo-animated.svg`, então a marca e a interface estão coesas. O SVG animado
  continua servindo só como fonte das cores, sem ser exibido em nenhuma página.
