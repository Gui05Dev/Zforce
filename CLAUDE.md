# Z-Force — guia do projeto

Site institucional da Z-Force Mobilidade Elétrica (oficina de patinetes, scooters e bikes
elétricas em Cafelândia-PR). HTML, CSS e JavaScript puros — **sem framework** — empacotados com
Vite e publicados no GitHub Pages.

**A régua para qualquer decisão:** o objetivo do site é abrir conversa no WhatsApp. O visitante
típico está com o veículo quebrado, no celular, em rede móvel. Peso e tempo até a primeira
interação valem mais do que efeito visual.

Detalhes longos (otimização de modelo 3D, licença do Sketchfab, conteúdo pendente) estão no
[README.md](README.md). Este arquivo tem só as regras que o código não explica sozinho.

## Comandos

```bash
npm run dev          # http://localhost:5173 com HMR
npm run build        # gera dist/
npm run preview      # serve dist/ em http://localhost:4173
npm run lint         # ESLint
npm test             # unitários (node:test)
npm run test:e2e     # Playwright headless, Chrome instalado
npm run test:gpu     # janela visível com GPU: fundo 3D e diagnóstico
npm run model:build       # regenera os GLB otimizados
npm run og:image          # regenera public/assets/og-zforce.jpg
npm run diagnostic:poster # regenera a imagem de fallback do diagnóstico
```

## Cores da marca

Azul e verde saem de `assets/zforce-logo-animated.svg` e estão em variáveis no `:root`:
`--brand-blue` (#00c2d1, cor principal), `--brand-green` (#a8e000, destaque), `--brand-gradient`,
`--brand-glow` e `--brand-fundo`. **Nada de laranja** — a identidade anterior foi removida por
completo, inclusive nos shaders do Three.js e no template da imagem de compartilhamento.

O gradiente cheio fica reservado ao CTA e a detalhes finos (fio do rodapé, traço dos rótulos).
Fundos seguem pretos e cinza-escuros.

## Camadas de animação (regra principal)

Cada biblioteca é dona de um território. **Nunca deixe duas bibliotecas animando a mesma
propriedade do mesmo elemento** — é a origem mais provável de bug visual aqui.

| Camada | Território |
| --- | --- |
| **GSAP** (ScrollTrigger, ScrollSmoother, SplitText) | Rolagem, entrada do hero, revelações, gatilhos de seção |
| **Motion** | Resposta à interação: hover, press, menu, indicadores, troca de card |
| **Anime.js** | Desenho técnico em SVG do hero |
| **Three.js** | Tudo dentro de `<canvas>`, mais a posição dos hotspots do diagnóstico |

Exemplo do limite: no diagnóstico o GSAP revela os blocos, o Three posiciona os pontos sobre o
modelo e o Motion anima a troca do card. Nenhum toca no que é do outro.

No hero vale o mesmo: o GSAP só avisa **quando** o hero entra em cena (`onHeroVisible`), e
`criarPalcoDoHero()` em [js/main.js](js/main.js) decide o resto — o desenho começa aí, fica
parado `PAUSA_APOS_DESENHO` depois de pronto e só então dá lugar ao patinete 3D, desde que a
seção ainda esteja visível. Quem passa direto tem a troca adiada até voltar.

Outras regras de scroll:
- O **ScrollSmoother é criado antes de qualquer ScrollTrigger**. Não é criado com
  `prefers-reduced-motion` nem em aparelhos só de toque (lá a rolagem é nativa).
- O topo fixo fica **fora** de `#smooth-content` (não pode sofrer transform).
- `data-speed` / `data-lag` só em elementos decorativos.

Feedback de interação (press, hover) é rápido de propósito — 100–200 ms. Só transição de conteúdo
é lenta. Não uniformize os dois.

## A abertura (símbolo antes do hero)

Antes do hero existe uma abertura: a palavra "Z-FORCE" é um recorte SVG e, ao rolar, a câmera
entra por dentro do Z até a tela caber no traço — só então o recorte é solto e o hero aparece.
Módulo em [js/modules/glyphPortal.js](js/modules/glyphPortal.js), que traz o aviso de licença MIT
do Glyph Portal, de onde vem o algoritmo da maior área cheia de tinta.

O que não é óbvio no código:

- O palco é `position: fixed` e fica **fora de `#smooth-content`**, como o topo. Um espaçador
  dentro do conteúdo cria a distância de rolagem e empurra o hero para baixo o mesmo tanto, então
  o hero já está na posição final quando a abertura termina — sem pin, sem sticky, sem salto.
- **A entrada do hero fica pausada** e quem a dispara é a revelação (`playHero`). A trava de 1,2 s
  do `index.html` continua valendo: se a abertura não iniciar, o hero é revelado pelo CSS.
- `#inicio` e `#conteudo` são removidos do endereço no carregamento (script inline do `<head>`):
  apontam para o topo do conteúdo, e a abertura fica acima dele. Sem isso, clicar na marca grava
  `#inicio` e toda entrada seguinte pularia a introdução.
- Com `prefers-reduced-motion` ou sem JavaScript o CSS esconde palco e espaçador.

Duração: `distancia()` no módulo (alturas de tela) e os marcos `REVELA`, `CAMERA_PRONTA` e `SOME`.

## Progressive enhancement

Sem JavaScript, com `prefers-reduced-motion` ou se um módulo falhar, **todo o conteúdo fica
visível no estado final**. Isso não é acidente, é requisito testado.

- Os links de WhatsApp ficam **escritos por extenso no `index.html`**, não montados em JS.
- O HTML das seções geradas sai no build (plugin em [vite.config.js](vite.config.js)), não no
  navegador.
- `safely()` em [js/main.js](js/main.js) isola cada módulo: uma falha vira log, o resto segue.
- Sem WebGL o hero usa fundo em CSS e o diagnóstico usa a imagem ilustrativa.

## A trava do hero

Contrato entre [index.html](index.html), [css/style.css](css/style.css) e
[gsapScrollAnimations.js](js/modules/gsapScrollAnimations.js). Quebra fácil e o sintoma é feio:

1. O script inline marca `.anim` e o CSS esconde `.js-hero` (`opacity: 0`).
2. Se em **1,2 s** o GSAP não marcou `anim-ready`, a trava troca `.anim` por `.anim-fallback` e o
   CSS revela o hero sozinho.
3. O GSAP, ao chegar atrasado, **verifica a ausência de `.anim` e não refaz a entrada**.

Ao mexer no `heroIntro`, mantenha o passo 3. Sem ele o hero pisca. Coberto por
[tests/e2e/hero-fallback.spec.js](tests/e2e/hero-fallback.spec.js).

## Fontes únicas de dados

Não espalhe esses valores pelo código:

- [js/data/contact.js](js/data/contact.js) — número de WhatsApp.
- [js/data/site.js](js/data/site.js) — endereço público, textos de compartilhamento e JSON-LD.
  Gera o `<head>` no build, mais `robots.txt`, `sitemap.xml` e o `CNAME` do domínio próprio.
  **Trocar de domínio = mudar só `url` aqui.** O site é publicado em `zforce.com.br`; o `CNAME`
  precisa sair no artefato, senão um deploy pode derrubar a configuração do repositório.
- [js/data/diagnostic.js](js/data/diagnostic.js) — componentes, hotspots, sintomas, etapas e
  caminhos do modelo. Gera o HTML da seção no build.

## As três raízes de assets

| Pasta | Destino |
| --- | --- |
| `assets/` | Processada pelo Vite (hash no nome) |
| `public/` | Copiada crua para o `dist/` |
| `assets-src/` | Versionada no Git, **fora do build** |

O modelo 3D original (`scene.gltf` + `scene.bin` + `textures/`, ~9,4 MB) vive em `assets-src/` e
**não pode voltar para `public/`** — ele sozinho levava o `dist/` de 3,1 MB para 12 MB. Só o GLB
otimizado (~900 KB) é publicado. Há teste travando essa regressão.

## Orçamento de performance

O chunk de entrada tem ~97 KB gzip (GSAP, Motion, Anime e o código próprio, incluindo a
abertura). Ele bloqueia a revelação do hero, então é o número que importa — confira com
`npm run build` sempre que mexer no caminho crítico.

- Três bibliotecas de animação no caminho crítico já é muito. Consolidar é melhoria pendente;
  adicionar uma quarta precisa de justificativa forte.
- Three.js, o modelo e o diagnóstico entram por **import dinâmico**, só quando a seção se aproxima.
- O corte do 3D do hero é por **aparelho** (`touchOnly`), nunca por largura de janela: desktop com
  janela estreita tem a mesma GPU e menos pixels. Usar `mobile` aqui tira o 3D de quem só
  restaurou a janela — e faz o resultado depender do tamanho dela no carregamento, já que o
  ambiente é lido uma única vez.
- Pela mesma razão, **nada que dependa de largura deve ler `env.mobile`**: esse valor é um retrato
  do boot. Use `gsap.matchMedia()` com a condição, que reverte e refaz sozinho no resize.
- Mídia pesada no hero (vídeo de fundo, imagem grande) briga direto com o objetivo do site.

## Testes

Unitários cobrem dados e arquivos (imagens, modelos, metas). E2E cobre layout, acessibilidade,
teclado, reduced-motion, sem WebGL e sem JS. `test:gpu` exige janela visível.

Duas pegadinhas que já custaram tempo:

- **`vite preview` responde 200 com o `index.html`** para rota inexistente (SPA fallback). Não dá
  para afirmar 404 nele — verifique o corpo da resposta.
- **`scrollIntoViewIfNeeded` não funciona** nesta página: o ScrollSmoother move o conteúdo por
  `transform`. Navegue clicando nos links do menu, como um visitante.

## Convenções

Comentários, nomes de variáveis e títulos de teste em **português**, como já é o padrão do código.
Comentário explica *por quê*, não *o quê*.
