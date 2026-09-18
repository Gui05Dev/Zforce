// Abertura do site: a palavra "Z-FORCE" é um recorte e, ao rolar, a câmera entra por dentro da
// letra Z até que a tela inteira caiba dentro do traço — só aí o recorte é solto e o hero, que
// estava atrás o tempo todo, fica à vista.
//
// A técnica (medir a maior área cheia de tinta dentro da letra, calcular a escala a partir dela
// e remover o recorte apenas quando ele já cobre a tela) vem do Glyph Portal:
//
//   Glyph Portal © 2026 Christian Katzmann. MIT.
//   Origem: UsefulPortal.astro em https://ktzm.dk → UsefulPortal.tsx → ClarityPortal.tsx.
//
// Reescrita em JavaScript puro sobre GSAP/ScrollTrigger. O componente original usa
// position: sticky e lê o scroll direto, o que não serve aqui: o ScrollSmoother transforma
// #smooth-content, e nada lá dentro pode ser fixo. Em vez disso o palco vive FORA do conteúdo
// rolável (como o topo) e um espaçador dentro dele cria a distância de rolagem — o hero sobe
// atrás do palco e já está na posição final quando o campo termina de sumir.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const PALAVRA = 'Z-FORCE';
const ENTRADA = 'Z'; // sem seletor de letras nesta versão
const ESCALA_SVG = 100; // font-size do <text> dentro do clipPath
const VARREDURA = 3; // mede em 3× para o quadrado de tinta ter resolução

// Marcos do progresso (0 a 1). Depois que a tinta preenche a tela não há mais o que revelar,
// então a passagem para o hero começa cedo: sem isso sobra meio percurso de gradiente parado.
const REVELA = 0.52; // hero começa a entrar por baixo, ainda dentro da letra
const CAMERA_PRONTA = 0.72; // recorte já cobre a tela: pode ser solto
const SOME = 0.7; // campo começa a dar lugar ao hero

const trava = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n));
const suave = (a, b, n) => {
  const t = trava((n - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/**
 * Maior quadrado totalmente opaco dentro do glifo, em tempo linear (programação dinâmica sobre
 * uma linha). É melhor que chutar a haste da letra: funciona igual em O, S ou Z, onde a parte
 * mais "cheia" não está onde a intuição diz.
 * @returns {{ x: number, y: number, raio: number } | null} em unidades do <text> (font-size 100)
 */
function maiorQuadradoDeTinta(ctx, char, fonte) {
  const canvas = ctx.canvas;
  ctx.font = fonte;
  const m = ctx.measureText(char);
  const folga = 8;
  const esq = Math.ceil(m.actualBoundingBoxLeft);
  const acima = Math.ceil(m.actualBoundingBoxAscent);
  canvas.width = Math.max(1, Math.ceil(m.actualBoundingBoxLeft + m.actualBoundingBoxRight) + folga * 2);
  canvas.height = Math.max(1, Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) + folga * 2);
  // Mudar o tamanho do canvas zera o contexto: a fonte precisa ser reaplicada.
  ctx.font = fonte;
  ctx.fontKerning = 'none';
  ctx.fillText(char, folga + esq, folga + acima);

  const { width, height } = canvas;
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const linha = new Uint16Array(width + 1);
  let lado = 0;
  let bx = 0;
  let by = 0;
  for (let y = 0; y < height; y++) {
    let diagonal = 0;
    for (let x = 0; x < width; x++) {
      const emCima = linha[x + 1];
      linha[x + 1] = pixels[(y * width + x) * 4 + 3] > 245 ? Math.min(emCima, linha[x], diagonal) + 1 : 0;
      diagonal = emCima;
      if (linha[x + 1] > lado) {
        lado = linha[x + 1];
        bx = x;
        by = y;
      }
    }
  }
  if (lado < 3) return null;
  // Inscreve um disco no quadrado, com folga de 1px para discordância de rasterização.
  return {
    x: (bx + 1 - lado / 2 - folga - esq) / VARREDURA,
    y: (by + 1 - lado / 2 - folga - acima) / VARREDURA,
    raio: (lado / 2 - 1) / VARREDURA,
  };
}

/**
 * @param {object} options
 * @param {{ reducedMotion: boolean, touchOnly: boolean }} options.env
 * @param {() => void} [options.onReveal] chamado uma única vez, quando o hero deve entrar
 * @returns {{ revelado: boolean, destroy(): void } | null} null quando a abertura não se aplica
 */
export function initGlyphPortal({ env, onReveal }) {
  const palco = document.querySelector('[data-portal]');
  const espaco = document.querySelector('[data-portal-espaco]');
  // Com "reduzir movimento" o conteúdo aparece direto: o CSS já esconde palco e espaçador.
  if (!palco || !espaco || env.reducedMotion) return null;

  const campo = palco.querySelector('[data-portal-campo]');
  const arte = palco.querySelector('[data-portal-arte]');
  const glifo = palco.querySelector('[data-portal-glifo]');
  const recorte = palco.querySelector('#portal-recorte');
  if (!campo || !arte || !glifo || !recorte) return null;

  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  let W = 1;
  let H = 1;
  let percurso = 1;
  let escalaInicial = 1;
  let escalaFinal = 1;
  let limites = { largura: 0, altura: 0 };
  let centro = { x: 0, y: 0 };
  let alvo = null;
  let medido = false;
  let revelado = false;
  let ultimo = -1;

  /** Fora do caminho: sem cobrir cliques nem entrar na ordem de foco. */
  const encerrar = fim => {
    palco.dataset.portalFim = String(fim);
  };

  /** Mede a palavra e o interior da letra de entrada, em unidades do <text>. */
  const medirTinta = () => {
    const estilo = getComputedStyle(glifo);
    const familia = estilo.fontFamily;
    const peso = estilo.fontWeight;
    ctx.font = `${peso} ${ESCALA_SVG}px ${familia}`;
    ctx.fontKerning = 'none';

    const m = ctx.measureText(PALAVRA);
    const largura = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
    const altura = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    if (!largura || !altura) return false;

    // getBBox do SVG inclui a caixa de linha em alguns navegadores: enquadra a tinta visível.
    limites = { largura, altura };
    centro = { x: -m.actualBoundingBoxLeft + largura / 2, y: -m.actualBoundingBoxAscent + altura / 2 };

    const indice = Math.max(0, PALAVRA.indexOf(ENTRADA));
    const avanco = ctx.measureText(PALAVRA.slice(0, indice)).width;
    const dentro = maiorQuadradoDeTinta(ctx, ENTRADA, `${peso} ${ESCALA_SVG * VARREDURA}px ${familia}`);
    if (!dentro) return false;
    alvo = { x: dentro.x + avanco, y: dentro.y, raio: dentro.raio };
    return true;
  };

  const distancia = () => {
    // Percurso menor no celular: uma abertura longa no toque cansa antes de revelar.
    const alturaJanela = window.innerHeight || 1;
    return Math.round(alturaJanela * (env.touchOnly ? 1.1 : 1.9));
  };

  const medirCena = () => {
    W = palco.clientWidth || window.innerWidth;
    H = palco.clientHeight || window.innerHeight;
    percurso = distancia();
    espaco.style.setProperty('--portal-percurso', `${percurso}px`);
    arte.setAttribute('viewBox', `0 0 ${W} ${H}`);

    if (!medido) medido = medirTinta();
    if (!medido || !alvo) return;

    escalaInicial = Math.min((W * 0.84) / limites.largura, (H * 0.34) / limites.altura);
    // A diagonal inteira da tela precisa caber dentro do disco de tinta; o 1.35 é a margem para
    // a borda da letra nunca reaparecer no quadro depois de termos entrado nela.
    escalaFinal = Math.max(escalaInicial, Math.hypot(W, H) / (alvo.raio * 1.35));
    palco.dataset.portalPronto = 'true';
  };

  const pintar = progresso => {
    if (!medido || !alvo) return;
    const p = trava(progresso);
    if (p === ultimo) return;
    ultimo = p;

    const t = trava(p / CAMERA_PRONTA);
    const facil = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
    // Escala exponencial: a sensação de aproximação fica constante do começo ao fim.
    const escala = Math.exp(Math.log(escalaInicial) + Math.log(escalaFinal / escalaInicial) * facil);
    // A câmera sai do centro da palavra e chega ao centro da tinta, no ritmo do zoom.
    const mistura =
      escalaFinal === escalaInicial ? 0 : (1 / escala - 1 / escalaInicial) / (1 / escalaFinal - 1 / escalaInicial);
    const cx = centro.x + (alvo.x - centro.x) * mistura;
    const cy = centro.y + (alvo.y - centro.y) * mistura;
    const meioY = H * 0.46 + H * 0.04 * facil;

    // A escala fica no clipPath e a translação no <text>: manter a escala no texto esbarra nos
    // limites de rasterização de fonte quando o zoom passa de algumas centenas de vezes.
    recorte.setAttribute('transform', `scale(${escala})`);
    glifo.setAttribute('transform', `translate(${W / 2 / escala - cx} ${meioY / escala - cy})`);

    // Só solta o recorte depois que a tinta já preenche a tela inteira.
    campo.style.clipPath = t >= 1 ? 'none' : 'url(#portal-recorte)';
    palco.style.setProperty('--portal-campo-escala', String(1 + 0.14 * suave(0, 0.82, p)));
    palco.style.setProperty('--portal-escuro', String(suave(0.34, 0.86, p)));
    palco.style.setProperty('--portal-opacidade', String(1 - suave(SOME, 1, p)));
    // Parar a um pixel do fim ainda dá progresso 0,999: sem esta margem o palco continuaria
    // invisível por cima da página, engolindo os cliques do hero.
    encerrar(p >= 0.999);

    if (!revelado && p >= REVELA) {
      revelado = true;
      onReveal?.();
    }
  };

  const gatilho = ScrollTrigger.create({
    start: 0,
    end: () => percurso,
    invalidateOnRefresh: true,
    onRefresh: self => {
      medirCena();
      pintar(self.progress);
    },
    onUpdate: self => pintar(self.progress),
    // A rolagem pode passar do fim sem gerar um onUpdate com progresso exatamente 1.
    onLeave: () => encerrar(true),
    onEnterBack: () => encerrar(false),
  });

  medirCena();
  pintar(gatilho.progress ?? 0);

  // Fonte trocada depois da medição moveria a tinta debaixo da câmera: remede uma vez. Até lá
  // quem aparece é o cartaz estático do CSS, com a mesma fonte e o mesmo gradiente.
  const aoCarregarFontes = () => {
    medido = false;
    ultimo = -1;
    medirCena();
    pintar(gatilho.progress ?? 0);
  };
  document.fonts?.ready.then(aoCarregarFontes);

  return {
    /** Verdadeiro quando a revelação já passou — o GSAP pode ficar pronto depois dela. */
    get revelado() {
      return revelado;
    },
    destroy() {
      gatilho.kill();
      delete palco.dataset.portalPronto;
      delete palco.dataset.portalFim;
      espaco.style.removeProperty('--portal-percurso');
      campo.style.clipPath = '';
    },
  };
}
