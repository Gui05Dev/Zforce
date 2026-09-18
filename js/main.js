// Ponto único de inicialização. Os links do WhatsApp já vêm prontos no HTML:
// funcionam mesmo se este script (ou qualquer animação) falhar.
import { getSceneConfig, readEnvironment } from './modules/env.js';
import { initSmoothScroll } from './modules/smoothScroll.js';
import { initScrollAnimations } from './modules/gsapScrollAnimations.js';
import { initGlyphPortal } from './modules/glyphPortal.js';
import { initInteractions } from './modules/motionInteractions.js';
import { createHeroDrawing, createStepsIndicators } from './modules/animeCounters.js';
import { initDiagnostic } from './modules/interactiveDiagnostic.js';

const root = document.documentElement;
const $ = sel => document.querySelector(sel);

document.querySelectorAll('[data-year]').forEach(el => {
  el.textContent = String(new Date().getFullYear());
});

const env = readEnvironment();
const cleanups = [];
let disposed = false;

/** Isola cada módulo: uma falha vira log e o restante do site segue funcionando. */
function safely(name, factory, fallback) {
  try {
    return factory() ?? fallback;
  } catch (error) {
    console.error(`[z-force] falha ao iniciar ${name}`, error);
    return fallback;
  }
}

// O SplitText mede linhas, então espera as fontes — mas com teto curto: elas já estão em
// <link rel="preload">, e cada milissegundo aqui atrasa a revelação do hero (ver a trava no index.html).
function waitForFonts(timeout = 400) {
  const ready = document.fonts ? document.fonts.ready : Promise.resolve();
  return Promise.race([ready, new Promise(resolve => setTimeout(resolve, timeout))]);
}

const idle = window.requestIdleCallback
  ? callback => window.requestIdleCallback(callback, { timeout: 1500 })
  : callback => setTimeout(callback, 600);

/** Executa `callback` uma vez quando `element` se aproxima da tela. */
function whenNear(element, margin, callback) {
  if (!element) return;
  const observer = new IntersectionObserver(
    entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      callback();
    },
    { rootMargin: margin },
  );
  observer.observe(element);
  cleanups.push(() => observer.disconnect());
}

/** Quanto o desenho técnico fica parado, completo, antes de dar lugar ao patinete 3D. */
const PAUSA_APOS_DESENHO = 1000;

/**
 * Coordena o palco do hero: quando o desenho técnico começa e quando ele dá lugar ao 3D.
 *
 * As duas coisas dependem do hero estar em cena, não de um relógio contado desde a abertura do
 * site — o visitante pode demorar na introdução, e trocar o desenho pelo modelo enquanto ele
 * ainda está lá em cima significaria nunca ver o desenho. Se ele passar direto pelo hero, a
 * troca fica guardada e acontece quando voltar.
 */
function criarPalcoDoHero(drawing) {
  let visivel = false;
  let trocar = null;
  let trocou = false;
  let espera = 0;

  const tentar = () => {
    clearTimeout(espera);
    if (trocou || !trocar || !visivel) return;
    // O desenho fica parado e completo por um instante perceptível antes de sumir.
    espera = setTimeout(() => {
      if (trocou || !visivel || disposed) return;
      trocou = true;
      trocar();
    }, PAUSA_APOS_DESENHO);
  };
  cleanups.push(() => clearTimeout(espera));

  return {
    /** O GSAP avisa quando o hero entra e sai de cena. */
    definirVisivel(agora) {
      visivel = agora;
      if (agora) drawing.play();
      tentar();
    },
    /** O modelo carregou e o desenho terminou: agora é só questão de momento. */
    modeloPronto(acao) {
      trocar = acao;
      tentar();
    },
  };
}

/**
 * Prepara o fundo 3D do hero e devolve um gatilho manual.
 *
 * Aumentar o rootMargin não adianta com o ScrollSmoother: ele recorta o #smooth-wrapper no
 * tamanho da janela, e o IntersectionObserver respeita esse recorte — nada além da tela chega a
 * ser "quase visível". Por isso quem antecipa o download durante a introdução é o portal, que
 * chama o gatilho devolvido aqui.
 * @returns {() => void} inicia o carregamento; chamadas repetidas são ignoradas
 */
function loadHeroScene(drawing, palco) {
  const host = $('[data-hero-canvas]');
  const config = host && getSceneConfig(env);
  if (!config) {
    root.classList.add('sem-3d');
    return () => {};
  }
  let iniciado = false;
  const carregar = () => {
    if (iniciado || disposed) return;
    iniciado = true;
    idle(() => {
      import('./modules/threeHeroScene.js')
        .then(({ createHeroScene }) => {
          if (disposed) return;
          const scene = createHeroScene(host, config, {
            drawing: $('[data-hero-drawing]'),
            onLost: () => drawing.restore(),
          });
          cleanups.push(() => {
            scene.destroy();
            drawing.restore();
          });
          // Baixar cedo, mostrar na hora certa: o modelo pode chegar durante a abertura, mas
          // quem manda trocar é o palco do hero. Se o modelo falhar, o desenho SVG continua
          // (celular, sem WebGL e movimento reduzido nem chegam aqui).
          Promise.all([scene.scooterReady, drawing.finished])
            .then(([ready]) => {
              if (!ready || disposed) return;
              palco.modeloPronto(() => {
                drawing.handOff();
                scene.revealScooter();
              });
            })
            .catch(error => console.warn('[z-force] patinete 3D indisponível, mantendo o desenho', error));
        })
        .catch(error => {
          root.classList.add('sem-3d');
          console.warn('[z-force] fundo 3D indisponível, mantendo fundo em CSS', error);
        });
    });
  };
  // O chunk do Three.js só é baixado quando o hero está (ou está prestes a ficar) visível.
  whenNear(host, '200px', carregar);
  return carregar;
}

async function boot() {
  performance.mark('zf:boot');
  // 1) ScrollSmoother antes de qualquer ScrollTrigger.
  const smooth = safely('ScrollSmoother', () => initSmoothScroll({ env }), { smoother: null, destroy() {} });
  cleanups.push(() => smooth.destroy());
  performance.mark('zf:smoother');

  const interactions = safely('Motion', () => initInteractions({ env }), null);
  const drawing = safely('Anime (desenho)', () => createHeroDrawing($('[data-hero-drawing]'), env), {
    play() {},
    finished: Promise.resolve(),
    handOff() {},
    restore() {},
  });
  const steps = safely(
    'Anime (etapas)',
    () => createStepsIndicators($('[data-steps]'), env),
    { setProgress() {}, setActive() {} },
  );
  if (interactions) cleanups.push(() => interactions.destroy());
  performance.mark('zf:motion-anime');

  // Diagnóstico interativo: prepara o card e os botões antes do GSAP medir a página;
  // o modelo 3D só é baixado quando a seção se aproxima da tela.
  const diagnostic = safely('Diagnóstico', () => initDiagnostic({ root: $('[data-diagnostic]'), env }), null);
  if (diagnostic) cleanups.push(() => diagnostic.destroy());

  // 2) Abertura com o símbolo Z: ScrollTrigger próprio, criado depois do ScrollSmoother. Quando
  // não se aplica (reduzir movimento, sem os elementos) devolve null e o hero entra sozinho.
  // Não depende das fontes — é um caminho vetorial —, então aparece sem esperar por elas.
  let revelarHero = () => {};
  const portal = safely('Abertura', () => initGlyphPortal({ env, onReveal: () => revelarHero() }), null);
  if (portal) cleanups.push(() => portal.destroy());

  const palcoDoHero = criarPalcoDoHero(drawing);

  // SplitText mede linhas: espera as fontes (com limite curto) para não quebrar errado.
  await waitForFonts();
  if (disposed) return;
  performance.mark('zf:fonts');

  const scroll = safely(
    'GSAP',
    () =>
      initScrollAnimations({
        env,
        // A entrada do hero espera a revelação do portal em vez de rodar atrás dele.
        heroPausado: Boolean(portal),
        hooks: {
          // O desenho começa quando o hero entra em cena, não na timeline de entrada: com a
          // abertura à frente, a entrada acontece antes de o visitante chegar de fato ao hero.
          onHeroVisible: visivel => palcoDoHero.definirVisivel(visivel),
          onSectionChange: id => interactions?.setActiveSection(id),
          onStepsProgress: progress => steps.setProgress(progress),
          onStepActive: (index, active) => steps.setActive(index, active),
        },
      }),
    null,
  );

  // Devolve o gatilho manual do 3D: durante a abertura o modelo já vai sendo buscado.
  const carregarCena = loadHeroScene(drawing, palcoDoHero);

  if (scroll) {
    cleanups.push(() => scroll.destroy());
    revelarHero = () => {
      scroll.playHero();
      carregarCena();
    };
    // O portal pode ter revelado antes do GSAP existir (recarregar a página já rolada, abrir
    // direto em /#contato): nesse caso a entrada acontece agora, sem esperar outro gatilho.
    if (portal?.revelado) revelarHero();
  } else {
    // Sem o orquestrador de scroll, tudo vai direto ao estado final visível.
    root.classList.remove('anim');
    palcoDoHero.definirVisivel(true);
  }
  root.classList.add('anim-ready');
  performance.mark('zf:gsap');
}

function teardown() {
  disposed = true;
  cleanups.splice(0).reverse().forEach(fn => {
    try {
      fn();
    } catch (error) {
      console.error('[z-force] falha ao limpar módulo', error);
    }
  });
}

window.addEventListener('pagehide', event => {
  if (!event.persisted) teardown(); // mantém tudo vivo se a página for para o bfcache
});

// Vite HMR: ao salvar um módulo, a instância anterior é destruída antes de reiniciar,
// então não sobram ScrollSmoother, ScrollTriggers, canvas ou listeners duplicados.
if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(teardown);
}

// Contagem de instâncias para os testes de desenvolvimento (não entra no build de produção).
if (import.meta.env.DEV) {
  window.__zforceDebug = async () => {
    const { ScrollTrigger } = await import('gsap/ScrollTrigger');
    const { ScrollSmoother } = await import('gsap/ScrollSmoother');
    return {
      triggers: ScrollTrigger.getAll().length,
      smoother: Boolean(ScrollSmoother.get()),
      canvases: document.querySelectorAll('[data-hero-canvas] canvas').length,
      pinSpacers: document.querySelectorAll('.pin-spacer').length,
      cleanups: cleanups.length,
    };
  };
}

boot();
