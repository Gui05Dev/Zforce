// GSAP + ScrollTrigger: dono de tudo que depende da rolagem e da entrada do hero.
// Não toca em botões/cards internos (Motion), traços SVG e números (Anime.js) nem no canvas (Three.js):
// para esses, só dispara os callbacks recebidos em `hooks`.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(ScrollTrigger, SplitText);

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const noop = () => {};

/**
 * @param {object} options
 * @param {{ reducedMotion: boolean, mobile: boolean, lowPower: boolean }} options.env
 * @param {object} options.hooks callbacks para os outros módulos
 */
export function initScrollAnimations({ env, hooks = {} }) {
  const {
    onHeroDrawing = noop,
    onSectionChange = noop,
    onHeroVisible = noop,
    onContactVisible = noop,
    onDiagnosticVisible = noop,
  } = hooks;
  const animate = !env.reducedMotion;
  const mobile = env.mobile;
  // A trava do index.html remove .anim quando este bundle demora mais de 1,2 s: o hero já foi
  // revelado por CSS. Refazer a entrada aqui esconderia tudo de novo — um piscar bem visível.
  const heroPendente = document.documentElement.classList.contains('anim');

  // Gatilhos estruturais: valem com ou sem movimento, porque alimentam estados da interface.
  const structure = gsap.context(() => {
    const topo = $('[data-topo]');
    if (topo) {
      ScrollTrigger.create({ start: 12, end: 'max', toggleClass: { targets: topo, className: 'is-scrolled' } });
    }

    $$('main section[id]').forEach(section => {
      ScrollTrigger.create({
        trigger: section,
        start: 'top 45%',
        end: 'bottom 45%',
        onToggle: self => self.isActive && onSectionChange(section.id),
      });
    });

    const hero = $('[data-hero]');
    if (hero) {
      ScrollTrigger.create({
        trigger: hero,
        // 'top bottom': o hero fica abaixo do topo fixo, então 'top top' nunca estaria ativo no início.
        start: 'top bottom',
        end: 'bottom 35%',
        onToggle: self => onHeroVisible(self.isActive),
      });
    }

    // Do CTA até o fim da página o WhatsApp flutuante sai de cena: o botão principal já está ali
    // e o rodapé ("Voltar ao início") fica livre.
    const contact = $('#contato');
    if (contact) {
      ScrollTrigger.create({
        trigger: contact,
        start: 'top 75%',
        // +1: no fim exato da página o gatilho ainda conta como ativo (com 'max' ele "sairia").
        end: () => ScrollTrigger.maxScroll(window) + 1,
        invalidateOnRefresh: true,
        onToggle: self => onContactVisible(self.isActive),
      });
    }

    // Diagnóstico: o WhatsApp flutuante cobriria o modelo, os pontos e os botões no celular.
    const diagnostic = $('.diagnostico');
    if (diagnostic) {
      ScrollTrigger.create({
        trigger: diagnostic,
        start: 'top bottom',
        end: 'bottom top',
        onToggle: self => onDiagnosticVisible(self.isActive),
      });
    }
  });

  let intro = null;
  const mm = gsap.matchMedia();

  if (animate) {
    try {
      if (heroPendente) intro = gsap.context(() => heroIntro({ onHeroDrawing, mobile }));
      else onHeroDrawing(); // hero já visível: só o desenho técnico ainda precisa ser disparado

      // Revelações e feixes: revertem sozinhos se o usuário ativar "reduzir movimento" com a página aberta.
      mm.add('(prefers-reduced-motion: no-preference)', () => scrollReveals({ mobile, lowPower: env.lowPower }));

      // Parallax: feito pelo ScrollSmoother (data-speed / data-lag em elementos decorativos).
    } catch (error) {
      // Desfaz estados iniciais parciais para nenhum conteúdo ficar invisível.
      mm.revert();
      intro?.revert();
      structure.revert();
      throw error;
    }
  } else {
    // Sem movimento a timeline não roda, então o desenho aparece completo de imediato.
    onHeroDrawing();
  }

  // Medidas mudam quando fontes e imagens terminam de carregar.
  const refresh = () => ScrollTrigger.refresh();
  document.fonts?.ready.then(refresh);
  if (document.readyState === 'complete') refresh();
  else window.addEventListener('load', refresh, { once: true });

  return {
    refresh,
    destroy() {
      window.removeEventListener('load', refresh);
      mm.revert();
      intro?.revert();
      structure.revert();
    },
  };
}

function heroIntro({ onHeroDrawing, mobile }) {
  const hero = $('[data-hero]');
  if (!hero) return;
  const title = $('[data-hero-title]', hero);
  const [eyebrow, lead, actions] = $$('[data-hero-item]', hero);
  const figure = $('[data-hero-figure]', hero);
  const strip = $('[data-hero-strip]', hero);
  const beams = $('[data-hero-beams]', hero);

  const split = title ? SplitText.create(title, { type: 'lines', mask: 'lines' }) : null;
  const tl = gsap.timeline({
    defaults: { ease: 'expo.out', duration: 1.1 },
    // Depois da entrada, o título volta ao DOM original e reflui livremente no resize.
    onComplete: () => split?.revert(),
  });

  // O CSS parte de opacity: 0 (não visibility), então os links do hero são focáveis desde o início.
  // Por isso fromTo explícito: um from() leria o 0 do CSS como valor final.
  const enter = (el, from, position, vars = {}) =>
    el && tl.fromTo(el, { opacity: 0, ...from }, { opacity: 1, x: 0, y: 0, ...vars }, position);

  // Tempos enxutos: todo o texto do hero fica legível em ~1 s; o desenho começa junto com o título.
  enter(eyebrow, { x: -18 }, 0, { duration: 0.7 });
  if (split) {
    tl.set(title, { opacity: 1 }, 0).from(split.lines, { yPercent: 108, duration: 1, stagger: 0.07 }, 0.05);
  }
  enter(lead, { y: 16 }, 0.12, { duration: 0.7 });
  enter(actions, { y: 16 }, 0.2, { duration: 0.7 });
  enter(figure, { clipPath: 'inset(0% 0% 100% 0%)' }, mobile ? 0.3 : 0.1, {
    clipPath: 'inset(0% 0% 0% 0%)',
    duration: 0.9,
    ease: 'power3.inOut',
    clearProps: 'clipPath',
  });
  tl.call(onHeroDrawing, null, mobile ? 0.35 : 0.15);
  enter(beams, {}, 0.3, { duration: 1.4, ease: 'power2.out' });
  if (strip) {
    tl.set(strip, { opacity: 1 }, 0.4).from(strip.children, { opacity: 0, y: 14, stagger: 0.07, duration: 0.7 }, 0.4);
  }
}

function scrollReveals({ mobile, lowPower }) {
  // A entrada por linhas mascaradas fica só no hero e no CTA final: repetida em todo h2, o
  // efeito virava ruído e atrasava a leitura de cada seção.

  // Cards de serviço: o GSAP move o <li>; o card interno é do Motion.
  batchReveal('.servico', { y: mobile ? 28 : 56, scale: mobile ? 1 : 0.98, stagger: 0.1, start: 'top 94%', duration: 0.95 });

  // Blocos revelados como um todo: palco 3D, painel do diagnóstico e etapas. O conteúdo
  // interno pertence a outras camadas (Three.js nos hotspots, Motion no card).
  batchReveal('[data-reveal-block]', { y: mobile ? 24 : 44, stagger: 0.08, start: 'top 94%', duration: 0.95 });

  ctaReveal({ mobile });

  // Feixes: gradientes estáticos deslizando por transform, pausados fora da tela.
  if (!lowPower) beamLoops({ mobile });
}

function batchReveal(selector, { y, scale = 1, stagger, start, duration = 1 }) {
  const targets = $$(selector);
  if (!targets.length) return;
  gsap.set(targets, { opacity: 0, y, scale });
  ScrollTrigger.batch(targets, {
    start,
    once: true,
    onEnter: batch =>
      gsap.to(batch, {
        opacity: 1,
        y: 0,
        scale: 1,
        duration,
        ease: 'expo.out',
        stagger,
        overwrite: true,
        clearProps: 'transform',
      }),
  });
}

function ctaReveal({ mobile }) {
  const panel = $('[data-cta]');
  if (!panel) return;
  const title = $('[data-cta-title]', panel);
  const items = $$('[data-cta-item]', panel);
  const split = title ? SplitText.create(title, { type: 'lines', mask: 'lines' }) : null;

  const tl = gsap.timeline({
    defaults: { ease: 'expo.out', duration: 1.1 },
    scrollTrigger: { trigger: panel, start: 'top 80%', once: true },
    onComplete: () => split?.revert(),
  });
  tl.fromTo(
    panel,
    { clipPath: mobile ? 'inset(4% 0% 4% 0% round 24px)' : 'inset(10% 7% 10% 7% round 32px)' },
    { clipPath: 'inset(0% 0% 0% 0% round 0px)', duration: 1.4, ease: 'power3.inOut', clearProps: 'clipPath' },
    0,
  );
  if (split) tl.from(split.lines, { yPercent: 108, stagger: 0.08, duration: 1.2 }, 0.35);
  if (items.length) tl.from(items, { opacity: 0, y: 28, stagger: 0.1 }, 0.5);
}

function beamLoops({ mobile }) {
  $$('[data-beams]').forEach(group => {
    const beams = $$('.feixe', group).filter(b => b.offsetWidth > 0);
    const groupTweens = beams.map((beam, index) => {
      // Percursos em % da própria largura: continuam corretos em qualquer tamanho de tela.
      const travel = (group.offsetWidth / beam.offsetWidth) * 100;
      return gsap.fromTo(
        beam,
        { xPercent: -100 },
        {
          xPercent: travel,
          duration: (mobile ? 7 : 5.2) + index * 1.6,
          ease: 'power1.inOut',
          repeat: -1,
          repeatDelay: 0.8 + index * 0.9,
          delay: index * 1.1,
          paused: true,
        },
      );
    });
    ScrollTrigger.create({
      trigger: group.closest('section') || group,
      start: 'top bottom',
      end: 'bottom top',
      onToggle: self => groupTweens.forEach(t => (self.isActive ? t.resume() : t.pause())),
    });
  });
}

