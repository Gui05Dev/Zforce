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
export function initScrollAnimations({ env, hooks = {}, heroPausado = false }) {
  const { onSectionChange = noop, onStepsProgress = noop, onStepActive = noop, onHeroVisible = noop } = hooks;
  const animate = !env.reducedMotion;
  // Largura é condição viva, não estado de boot: quem restaura ou estreita a janela precisa
  // receber os valores certos. Só a entrada do hero lê uma vez, porque roda uma vez só.
  // 859px: a mesma dobra do css/style.css. Ver o comentário em env.js.
  const estreito = () => window.matchMedia('(max-width: 859px)').matches || window.matchMedia('(pointer: coarse)').matches;
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

    // Quem decide a hora do desenho técnico e da troca pelo patinete 3D: os dois só acontecem
    // com o hero realmente em cena, e a troca espera o visitante voltar se ele passar direto.
    const hero = $('[data-hero]');
    if (hero) {
      ScrollTrigger.create({
        trigger: hero,
        // 'top bottom': o hero fica abaixo do topo fixo, então 'top top' nunca estaria ativo
        // no início da página.
        start: 'top bottom',
        end: 'bottom 30%',
        onToggle: self => onHeroVisible(self.isActive),
      });
    }

    // "Como funciona o atendimento": em telas largas e com movimento permitido, a seção
    // prende na tela (pin) enquanto a pessoa rola — só solta quando o "circuito" (linha +
    // anéis) completa, ou reverte se ela voltar. Em mobile / "reduzir movimento", cai para o
    // acompanhamento simples por rolagem natural, sem prender a página.
    const stepsArea = $('[data-steps]');
    if (stepsArea) {
      const steps = $$('[data-step]', stepsArea);
      const total = steps.length;

      const setActiveUpTo = activeIndex => {
        steps.forEach((step, index) => {
          const isActive = index <= activeIndex;
          if (step.classList.contains('is-active') !== isActive) {
            step.classList.toggle('is-active', isActive);
            onStepActive(index, isActive);
          }
        });
      };

      // Largura lida na hora: o gatilho é criado dentro do contexto de estrutura, que não é
      // refeito no resize. Um ScrollTrigger.refresh() recalcula posições, não troca o modo —
      // então quem cruza 860px continua no modo em que carregou. Fica registrado como limite
      // conhecido; trocar o modo em tempo real exigiria recriar o pin, com salto de rolagem.
      if (animate && !estreito() && total) {
        ScrollTrigger.create({
          trigger: stepsArea,
          // Prende perto do topo, mas não colada nele: sobra uma tira da seção anterior
          // visível no alto da tela enquanto a rolagem trava — não é uma tela cheia isolada
          // só com as etapas. Duração curta de propósito, só o necessário pro circuito acender.
          start: 'top 18%',
          end: () => `+=${window.innerHeight * 1.15}`,
          pin: true,
          // Sem isso, o pin usa "position: fixed" — que quebra dentro do ScrollSmoother, porque
          // o #smooth-content é movido via transform (o "fixed" passa a ser relativo a ele, não
          // à janela, e o bloco preso encolhe pro canto). "transform" faz o pin se mover junto
          // com o wrapper suavizado, do jeito certo.
          pinType: 'transform',
          pinSpacing: true,
          scrub: 0.4,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: self => {
            onStepsProgress(self.progress);
            setActiveUpTo(self.progress <= 0 ? -1 : Math.min(total - 1, Math.floor(self.progress * total)));
          },
        });
      } else {
        ScrollTrigger.create({
          trigger: stepsArea,
          start: 'top 62%',
          end: 'bottom 62%',
          onUpdate: self => onStepsProgress(self.progress),
          onRefresh: self => onStepsProgress(self.progress),
        });
        steps.forEach((step, index) => {
          ScrollTrigger.create({
            trigger: step,
            start: 'top 62%',
            onEnter: () => {
              step.classList.add('is-active');
              onStepActive(index, true);
            },
            onLeaveBack: () => {
              step.classList.remove('is-active');
              onStepActive(index, false);
            },
          });
        });
      }
    }
  });

  let intro = null;
  // Com o portal tipográfico à frente, a entrada do hero fica pronta mas parada: quem a dispara
  // é a revelação. Sem portal, `playHero` nunca é chamado e a timeline já nasce rodando.
  let playHero = () => {};
  const mm = gsap.matchMedia();

  if (animate) {
    try {
      if (heroPendente) {
        intro = gsap.context(() => {
          const tl = heroIntro({ mobile: estreito(), pausado: heroPausado });
          if (tl) playHero = () => tl.play();
        });
      }

      // Revelações e feixes: o matchMedia do GSAP reverte e refaz sozinho quando qualquer
      // condição muda — seja "reduzir movimento" ligado com a página aberta, seja a janela
      // atravessando 860px. Sem isso, quem abre estreito e maximiza fica com as distâncias de
      // celular para sempre, que é a armadilha que o CLAUDE.md descreve para o corte do 3D.
      mm.add(
        {
          semRestricao: '(prefers-reduced-motion: no-preference)',
          compacto: '(max-width: 859px), (pointer: coarse)',
        },
        contexto => {
          const { semRestricao, compacto } = contexto.conditions;
          if (!semRestricao) return;
          scrollReveals({ mobile: compacto, lowPower: env.lowPower });
        },
      );

      // Parallax: feito pelo ScrollSmoother (data-speed / data-lag em elementos decorativos).
    } catch (error) {
      // Desfaz estados iniciais parciais para nenhum conteúdo ficar invisível.
      mm.revert();
      intro?.revert();
      structure.revert();
      throw error;
    }
  }

  // Medidas mudam quando fontes e imagens terminam de carregar.
  const refresh = () => ScrollTrigger.refresh();
  document.fonts?.ready.then(refresh);
  if (document.readyState === 'complete') refresh();
  else window.addEventListener('load', refresh, { once: true });

  return {
    refresh,
    playHero: () => playHero(),
    destroy() {
      window.removeEventListener('load', refresh);
      mm.revert();
      intro?.revert();
      structure.revert();
    },
  };
}

function heroIntro({ mobile, pausado = false }) {
  const hero = $('[data-hero]');
  if (!hero) return null;
  const title = $('[data-hero-title]', hero);
  // Por nome, não por posição: remover um item do hero não pode deslocar a entrada dos outros.
  const lead = $('[data-hero-item="lead"]', hero);
  const actions = $('[data-hero-item="acoes"]', hero);
  const figure = $('[data-hero-figure]', hero);
  const beams = $('[data-hero-beams]', hero);

  const split = title ? SplitText.create(title, { type: 'lines', mask: 'lines' }) : null;
  const tl = gsap.timeline({
    paused: pausado,
    defaults: { ease: 'expo.out', duration: 1.1 },
    // Depois da entrada, o título volta ao DOM original e reflui livremente no resize.
    onComplete: () => split?.revert(),
  });

  // O CSS parte de opacity: 0 (não visibility), então os links do hero são focáveis desde o início.
  // Por isso fromTo explícito: um from() leria o 0 do CSS como valor final.
  const enter = (el, from, position, vars = {}) =>
    el && tl.fromTo(el, { opacity: 0, ...from }, { opacity: 1, x: 0, y: 0, ...vars }, position);

  // Tempos enxutos: todo o texto do hero fica legível em ~1 s; o desenho começa junto com o título.
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
  enter(beams, {}, 0.3, { duration: 1.4, ease: 'power2.out' });
  return tl;
}

function scrollReveals({ mobile, lowPower }) {
  // A entrada por linhas mascaradas fica só no hero e no CTA final: repetida em todo h2, o
  // efeito virava ruído e atrasava a leitura de cada seção.

  // Cards de serviço: o GSAP move o <li>; o card interno é do Motion.
  batchReveal('.servico', { y: mobile ? 28 : 56, scale: mobile ? 1 : 0.98, stagger: 0.1, start: 'top 94%', duration: 0.95 });

  // Blocos revelados como um todo: palco 3D, painel do diagnóstico e etapas. O conteúdo
  // interno pertence a outras camadas (Three.js nos hotspots, Motion no card).
  batchReveal('[data-reveal-block]', { y: mobile ? 24 : 44, stagger: 0.08, start: 'top 94%', duration: 0.95 });

  // Conteúdo de cada etapa de "Como funciona": entra uma vez, na sua própria vez (sem stagger em
  // lote) — o anel e a linha (Anime.js) que sincronizam com o scroll ficam por conta do onStepActive.
  $$('[data-step-content]').forEach(content => {
    gsap.from(content, {
      opacity: 0,
      x: mobile ? 0 : 28,
      y: mobile ? 16 : 0,
      duration: 0.85,
      ease: 'expo.out',
      scrollTrigger: { trigger: content, start: 'top 92%', once: true },
    });
  });

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
    scrollTrigger: { trigger: panel, start: 'top 85%', once: true },
    onComplete: () => split?.revert(),
  });
  // Painel visivelmente menor e recuado por dentro, crescendo (clip + escala) até o tamanho
  // real da seção — mais "expandir" do que o mascaramento sutil anterior.
  tl.fromTo(
    panel,
    {
      clipPath: mobile ? 'inset(18% 4% 18% 4% round 28px)' : 'inset(26% 16% 26% 16% round 40px)',
      scale: mobile ? 0.94 : 0.9,
    },
    {
      clipPath: 'inset(0% 0% 0% 0% round 0px)',
      scale: 1,
      duration: 1.5,
      ease: 'power3.inOut',
      clearProps: 'clipPath,scale,transform',
    },
    0,
  );
  if (split) tl.from(split.lines, { yPercent: 108, stagger: 0.08, duration: 1.2 }, 0.4);
  if (items.length) tl.from(items, { opacity: 0, y: 28, stagger: 0.1 }, 0.55);
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

