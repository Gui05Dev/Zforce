// Anime.js: desenho técnico do hero e indicadores das etapas. Os elementos daqui não são
// tocados por GSAP nem Motion; o GSAP apenas decide *quando* (via callbacks) e esta camada
// decide *como*.
import { animate, createDrawable, createTimeline, stagger, utils } from 'animejs';

const silent = { play() {} };

/**
 * Desenho técnico do hero: traços se desenham e as chamadas acendem em sequência.
 * `finished` resolve ao terminar; `handOff()` apaga o SVG quando o patinete 3D assume o lugar
 * e `restore()` o traz de volta (queda do WebGL, HMR). A opacidade do <svg> é exclusiva daqui.
 */
export function createHeroDrawing(svg, { reducedMotion }) {
  if (!svg) return { ...silent, finished: Promise.resolve(), handOff() {}, restore() {} };

  let resolveFinished;
  const finished = new Promise(resolve => (resolveFinished = resolve));
  const handOff = () => animate(svg, { opacity: 0, duration: 700, ease: 'inOutQuad' });
  const restore = () => animate(svg, { opacity: 1, duration: 400, ease: 'outQuad' });
  utils.set(svg, { opacity: 1 });

  if (reducedMotion) {
    resolveFinished();
    return { ...silent, finished, handOff, restore };
  }

  // Tracejados usam stroke-dasharray no CSS, então entram por opacidade em vez de desenho.
  const strokes = createDrawable(svg.querySelectorAll('.traco > :not(.tracejado)'));
  const dashed = svg.querySelectorAll('.traco > .tracejado');
  // Pontos de inspeção sem nomes (os nomes das peças ficam no Diagnóstico interativo).
  const dots = svg.querySelectorAll('.chamadas circle');

  utils.set(strokes, { draw: '0 0' });
  utils.set(dashed, { opacity: 0 });
  utils.set(dots, { scale: 0 });

  let played = false;
  return {
    finished,
    handOff,
    restore,
    play() {
      if (played) return;
      played = true;
      createTimeline({ defaults: { ease: 'inOutQuad' }, onComplete: () => resolveFinished() })
        .add(strokes, { draw: '0 1', duration: 1100, delay: stagger(32) }, 0)
        .add(dashed, { opacity: 1, duration: 500, delay: stagger(50) }, 600)
        .add(dots, { scale: [0, 1], duration: 460, ease: 'outBack(2)', delay: stagger(60) }, 850);
    },
  };
}

/** Linha e anéis de "Como funciona o atendimento", sincronizados com a rolagem pelo GSAP. */
export function createStepsIndicators(root, { reducedMotion }) {
  const inert = { setProgress() {}, setActive() {} };
  if (!root) return inert;
  const line = root.querySelector('[data-steps-line]');
  const nodes = [...root.querySelectorAll('[data-step-node]')];
  const rings = createDrawable(root.querySelectorAll('[data-step-ring]'));
  const [lineDrawable] = line ? createDrawable(line) : [];

  if (reducedMotion) {
    // Estado final estático: linha completa e anéis visíveis, sem depender do scroll.
    if (lineDrawable) utils.set(lineDrawable, { draw: '0 1' });
    utils.set(rings, { draw: '0 1' });
    return inert;
  }

  utils.set(rings, { draw: '0 0' });
  const lineAnimation = lineDrawable
    ? animate(lineDrawable, { draw: ['0 0', '0 1'], duration: 1000, ease: 'linear', autoplay: false })
    : null;

  return {
    setProgress(progress) {
      lineAnimation?.seek(progress * lineAnimation.duration, true);
    },
    setActive(index, active) {
      const ring = rings[index];
      if (!ring) return;
      animate(ring, { draw: active ? '0 1' : '0 0', duration: active ? 900 : 380, ease: 'inOutQuad' });
      if (active && nodes[index]) {
        animate(nodes[index], { scale: [1, 1.14, 1], duration: 700, ease: 'outQuad' });
      }
    },
  };
}
