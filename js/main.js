// Ponto único de inicialização. Os links do WhatsApp já vêm prontos no HTML:
// funcionam mesmo se este script (ou qualquer animação) falhar.
import { getSceneConfig, readEnvironment } from './modules/env.js';
import { initSmoothScroll } from './modules/smoothScroll.js';
import { initScrollAnimations } from './modules/gsapScrollAnimations.js';
import { initInteractions } from './modules/motionInteractions.js';
import { createCounters, createHeroDrawing } from './modules/animeCounters.js';
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

function loadHeroScene(drawing) {
  const host = $('[data-hero-canvas]');
  const config = host && getSceneConfig(env);
  if (!config) {
    root.classList.add('sem-3d');
    return;
  }
  // O chunk do Three.js só é baixado quando o hero está (ou está prestes a ficar) visível.
  whenNear(host, '200px', () =>
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
          // Desenho → 3D: só quando o traço terminou E o modelo carregou. Se o modelo falhar,
          // o desenho SVG simplesmente continua (celular, sem WebGL e movimento reduzido nem chegam aqui).
          Promise.all([scene.scooterReady, drawing.finished])
            .then(([ready]) => {
              if (!ready || disposed) return;
              drawing.handOff();
              scene.revealScooter();
            })
            .catch(error => console.warn('[z-force] patinete 3D indisponível, mantendo o desenho', error));
        })
        .catch(error => {
          root.classList.add('sem-3d');
          console.warn('[z-force] fundo 3D indisponível, mantendo fundo em CSS', error);
        });
    }),
  );
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
  const counters = safely('Anime (números)', () => createCounters($('[data-stats]'), env), { play() {} });
  if (interactions) cleanups.push(() => interactions.destroy());
  performance.mark('zf:motion-anime');

  // Diagnóstico interativo: prepara o card e os botões antes do GSAP medir a página;
  // o modelo 3D só é baixado quando a seção se aproxima da tela.
  const diagnostic = safely('Diagnóstico', () => initDiagnostic({ root: $('[data-diagnostic]'), env }), null);
  if (diagnostic) cleanups.push(() => diagnostic.destroy());

  // WhatsApp flutuante: escondido sobre o hero, sobre os controles de "Resultados" e do diagnóstico,
  // e do CTA final até o rodapé. Começa "fora" de todos: os gatilhos só avisam quando uma área está ativa.
  const floating = { hero: false, diagnostic: false, contact: false };
  const updateFloating = () => interactions?.setFloatingVisible(!Object.values(floating).some(Boolean));
  const floatingArea = area => visible => {
    floating[area] = visible;
    updateFloating();
  };

  // SplitText mede linhas: espera as fontes (com limite curto) para não quebrar errado.
  await waitForFonts();
  if (disposed) return;
  performance.mark('zf:fonts');

  const scroll = safely(
    'GSAP',
    () =>
      initScrollAnimations({
        env,
        hooks: {
          onHeroDrawing: () => drawing.play(),
          onStatsEnter: () => counters.play(),
          onSectionChange: id => interactions?.setActiveSection(id),
          onHeroVisible: floatingArea('hero'),
          onDiagnosticVisible: floatingArea('diagnostic'),
          onContactVisible: floatingArea('contact'),
        },
      }),
    null,
  );

  if (scroll) {
    cleanups.push(() => scroll.destroy());
  } else {
    // Sem o orquestrador de scroll, tudo vai direto ao estado final visível.
    root.classList.remove('anim');
    drawing.play();
    counters.play();
  }
  root.classList.add('anim-ready');
  performance.mark('zf:gsap');

  loadHeroScene(drawing);
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
