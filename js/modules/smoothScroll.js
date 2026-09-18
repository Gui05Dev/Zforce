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

  // A página continua crescendo depois do load: o espaçador do portal ganha altura, o
  // diagnóstico monta a seção, as fontes trocam. Um salto único deixa a âncora parada onde o
  // alvo estava, não onde ele ficou. Então a posição é reaplicada a cada refresh do
  // ScrollTrigger — e para no instante em que o visitante rola por conta própria.
  let visitanteRolou = false;
  let ultimaPosicao = null;
  let reancorando = false;
  const marcarRolagem = () => (visitanteRolou = true);
  const reancorar = () => {
    // scrollTo pede um refresh ao ScrollTrigger, que chama este ouvinte de novo: sem a trava
    // de reentrada a pilha estoura antes da página terminar de carregar.
    if (visitanteRolou || reancorando) return;
    const alvo = initialHash && document.getElementById(initialHash);
    if (!alvo) return;
    // A trava cobre a função inteira: tanto offset quanto scrollTo pedem refresh ao
    // ScrollTrigger, e cada refresh chama este ouvinte de volta.
    reancorando = true;
    try {
      const posicao = Math.round(smoother.offset(alvo, `top ${headerOffset()}px`));
      // Quando o layout para de crescer a posição repete e o reancoramento se encerra sozinho.
      if (posicao === ultimaPosicao) return;
      ultimaPosicao = posicao;
      smoother.scrollTo(posicao, false);
    } finally {
      reancorando = false;
    }
  };
  const pararDeReancorar = () => {
    ScrollTrigger.removeEventListener('refresh', reancorar);
    window.removeEventListener('wheel', marcarRolagem);
    window.removeEventListener('touchstart', marcarRolagem);
    window.removeEventListener('keydown', marcarRolagem);
    window.removeEventListener('load', jumpToHash);
  };
  let fimDoReancoramento = 0;
  if (initialHash) {
    if (document.readyState === 'complete') requestAnimationFrame(jumpToHash);
    else window.addEventListener('load', jumpToHash, { once: true });
    window.addEventListener('wheel', marcarRolagem, { passive: true, once: true });
    window.addEventListener('touchstart', marcarRolagem, { passive: true, once: true });
    window.addEventListener('keydown', marcarRolagem, { once: true });
    ScrollTrigger.addEventListener('refresh', reancorar);
    // Teto curto: passado isso a página já assentou, e insistir seria brigar com o visitante.
    fimDoReancoramento = window.setTimeout(pararDeReancorar, 4000);
  }

  return {
    smoother,
    scrollTo,
    destroy() {
      document.removeEventListener('click', onClick);
      clearTimeout(fimDoReancoramento);
      pararDeReancorar();
      smoother.kill();
      root.classList.remove('has-smoother');
    },
  };
}
