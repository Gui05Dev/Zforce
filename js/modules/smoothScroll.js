// GSAP ScrollSmoother: rolagem suave no desktop. Precisa ser criado ANTES de qualquer ScrollTrigger.
// Não é criado com "reduzir movimento" nem em aparelhos só de toque (rolagem nativa, sem transform),
// onde as âncoras continuam no comportamento do navegador com scroll-margin-top.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollSmoother } from 'gsap/ScrollSmoother';

gsap.registerPlugin(ScrollTrigger, ScrollSmoother);

const SMOOTH = 0.7;

/** @param {{ env: { reducedMotion: boolean } }} options */
export function initSmoothScroll({ env }) {
  const root = document.documentElement;
  const wrapper = document.getElementById('smooth-wrapper');
  const content = document.getElementById('smooth-content');
  const header = document.querySelector('[data-topo]');
  const touchOnly = ScrollTrigger.isTouch === 1;

  // Garante instância única (ex.: módulo reexecutado pelo HMR sem limpeza).
  ScrollSmoother.get()?.kill();

  if (!wrapper || !content || env.reducedMotion || touchOnly) {
    return { smoother: null, scrollTo: null, destroy() {} };
  }

  // Elemento que recebeu foco por navegação de âncora: já está sendo rolado até o topo,
  // então o ScrollSmoother não deve "centralizá-lo" (comportamento padrão para foco fora da tela).
  let anchorFocus = null;

  const smoother = ScrollSmoother.create({
    wrapper,
    content,
    smooth: SMOOTH,
    effects: true, // data-speed / data-lag somente em elementos decorativos
    smoothTouch: 0, // aparelhos híbridos (toque + mouse): toque sem suavização
    // Tab do teclado continua levando o elemento focado para a tela.
    onFocusIn: (_self, event) => event.target !== anchorFocus,
  });
  root.classList.add('has-smoother');

  const headerOffset = () => (header ? header.offsetHeight : 0);

  const focusTarget = target => {
    if (!target.hasAttribute('tabindex') && !target.matches('a, button, input, select, textarea')) {
      target.setAttribute('tabindex', '-1');
    }
    // preventScroll: o navegador não pode rolar o wrapper por conta própria.
    anchorFocus = target;
    target.focus({ preventScroll: true });
    anchorFocus = null;
  };

  const scrollTo = (target, { smooth = true } = {}) => {
    smoother.scrollTo(target, smooth, `top ${headerOffset()}px`);
  };

  // Um único listener delegado para todos os links internos (menu, skip link, rodapé, "Continue").
  const onClick = event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    const id = decodeURIComponent(link.hash.slice(1));
    const target = id && document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    scrollTo(target);
    if (location.hash !== `#${id}`) history.pushState(null, '', `#${id}`);
    focusTarget(target);
  };
  document.addEventListener('click', onClick);

  // Endereço aberto já com âncora (/#contato): posiciona depois das medidas finais.
  const initialHash = decodeURIComponent(location.hash.slice(1));
  const jumpToHash = () => {
    const target = initialHash && document.getElementById(initialHash);
    if (target) scrollTo(target, { smooth: false });
  };
  if (initialHash) {
    if (document.readyState === 'complete') requestAnimationFrame(jumpToHash);
    else window.addEventListener('load', jumpToHash, { once: true });
  }

  return {
    smoother,
    scrollTo,
    destroy() {
      document.removeEventListener('click', onClick);
      window.removeEventListener('load', jumpToHash);
      smoother.kill();
      root.classList.remove('has-smoother');
    },
  };
}
