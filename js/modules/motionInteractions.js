// Motion.dev: resposta da interface ao usuário (hover, toque, menu, indicadores).
// Controla só os elementos internos: botões, cards (não o <li> que o GSAP revela), menu e indicadores.
import { animate, hover, inView, press, stagger } from 'motion';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const spring = { type: 'spring', stiffness: 420, damping: 30, mass: 0.8 };
const springBouncy = { type: 'spring', stiffness: 520, damping: 18, mass: 0.6 };
const easeOut = [0.23, 1, 0.32, 1];

/** @param {{ env: { reducedMotion: boolean } }} options */
export function initInteractions({ env }) {
  const reduced = env.reducedMotion;
  const cleanups = [];
  const track = fn => fn && cleanups.push(fn);

  buttons(reduced, track);
  cards(reduced, track);
  const menu = mobileMenu(reduced, track);
  const indicator = navIndicator(reduced, track);
  entradaEmSequencia('[data-diferenciais]', '[data-diferencial]', reduced, track);
  rodape(reduced, track, env.lowPower);

  return {
    setActiveSection(id) {
      indicator.setActive(id);
    },
    destroy() {
      menu.close();
      cleanups.forEach(fn => fn());
    },
  };
}

function buttons(reduced, track) {
  $$('.botao').forEach(button => {
    const arrow = $('.botao-seta', button);
    if (!reduced) {
      track(
        hover(button, () => {
          animate(button, { y: -2 }, spring);
          if (arrow) animate(arrow, { x: 4 }, springBouncy);
          return () => {
            animate(button, { y: 0 }, spring);
            if (arrow) animate(arrow, { x: 0 }, spring);
          };
        }),
      );
    }
    // press() também responde a Enter no teclado.
    track(
      press(button, () => {
        animate(button, { scale: reduced ? 0.99 : 0.95 }, { type: 'spring', stiffness: 700, damping: 32 });
        return () => animate(button, { scale: 1 }, springBouncy);
      }),
    );
  });
}

function cards(reduced, track) {
  $$('[data-card]').forEach(card => {
    const glow = $('[data-card-glow]', card);
    const icon = $('[data-card-icon]', card);
    let frame = 0;
    let pointer = null;

    // Posição do brilho: uma leitura de layout por quadro, só enquanto o mouse está em cima.
    const updateGlow = () => {
      frame = 0;
      if (!pointer) return;
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${pointer.clientX - rect.left}px`);
      card.style.setProperty('--my', `${pointer.clientY - rect.top}px`);
    };
    const onMove = event => {
      pointer = event;
      if (!frame) frame = requestAnimationFrame(updateGlow);
    };

    const lift = () => {
      animate(glow, { opacity: 1 }, { duration: 0.35, ease: easeOut });
      if (!reduced) {
        animate(card, { y: -6 }, spring);
        animate(icon, { rotate: -8, scale: 1.08 }, springBouncy);
      }
    };
    const settle = () => {
      animate(glow, { opacity: 0 }, { duration: 0.5, ease: easeOut });
      if (!reduced) {
        animate(card, { y: 0 }, spring);
        animate(icon, { rotate: 0, scale: 1 }, spring);
      }
    };

    track(
      hover(card, (_el, event) => {
        onMove(event);
        card.addEventListener('pointermove', onMove, { passive: true });
        lift();
        return () => {
          card.removeEventListener('pointermove', onMove);
          pointer = null;
          if (!card.contains(document.activeElement)) settle();
        };
      }),
    );

    // Teclado: o foco dentro do card acende a borda a partir do topo.
    const onFocusIn = () => {
      card.style.setProperty('--mx', '50%');
      card.style.setProperty('--my', '0%');
      lift();
    };
    const onFocusOut = event => {
      if (!card.contains(event.relatedTarget) && !card.matches(':hover')) settle();
    };
    card.addEventListener('focusin', onFocusIn);
    card.addEventListener('focusout', onFocusOut);
    track(() => {
      card.removeEventListener('focusin', onFocusIn);
      card.removeEventListener('focusout', onFocusOut);
      cancelAnimationFrame(frame);
    });
  });
}

function mobileMenu(reduced, track) {
  const toggle = $('[data-menu-toggle]');
  const menu = $('[data-menu]');
  if (!toggle || !menu) return { close() {} };

  const label = $('.sr-only', toggle);
  const lines = $$('.menu-botao-linha', toggle);
  const links = $$('a', menu);
  const mobile = window.matchMedia('(max-width: 859px)');
  let open = false;

  // Volta ao estado de CSS puro. O Motion grava valores no estilo inline enquanto anima, então
  // cancelar a animação e limpar o estilo precisa acontecer junto — senão o menu fica preso à
  // aparência de celular depois de voltar para o desktop (acontece ao girar o aparelho).
  const limparEstilos = () => {
    [menu, ...links, ...lines].forEach(el => {
      el.getAnimations().forEach(animation => animation.cancel());
      el.style.opacity = '';
      el.style.transform = '';
    });
  };

  let limpezaFrame = 0;
  const clearInline = () => {
    cancelAnimationFrame(limpezaFrame);
    limparEstilos();
    // O Motion só cria a animação da Web Animations API no quadro seguinte ao animate(): repetir
    // a limpeza no próximo quadro alcança o que ainda não existia agora. (`cancel()` devolve o
    // valor inicial e `stop()` congela no meio — os dois deixariam estilo inline para trás.)
    limpezaFrame = requestAnimationFrame(limparEstilos);
    menu.classList.remove('open');
  };

  const setOpen = next => {
    if (next === open) return;
    open = next;
    toggle.setAttribute('aria-expanded', String(open));
    if (label) label.textContent = open ? 'Fechar menu' : 'Abrir menu';
    if (!mobile.matches) return;

    const quick = reduced ? { duration: 0 } : null;
    if (open) {
      menu.classList.add('open');
      animate(menu, { opacity: [0, 1], y: [-10, 0] }, quick || { duration: 0.3, ease: easeOut });
      animate(links, { opacity: [0, 1], x: [-16, 0] }, quick || { duration: 0.4, ease: easeOut, delay: stagger(0.045, { startDelay: 0.06 }) });
      animate(lines[0], { y: 4, rotate: 45 }, quick || spring);
      animate(lines[1], { y: -4, rotate: -45 }, quick || spring);
    } else {
      animate(menu, { opacity: 0, y: -8 }, quick || { duration: 0.18, ease: 'easeIn' }).then(() => {
        if (!open) menu.classList.remove('open');
      });
      animate(lines[0], { y: 0, rotate: 0 }, quick || spring);
      animate(lines[1], { y: 0, rotate: 0 }, quick || spring);
    }
  };

  const onToggle = () => setOpen(!open);
  const onLink = () => setOpen(false);
  const onKey = event => {
    if (!open) return;
    if (event.key === 'Escape') {
      setOpen(false);
      toggle.focus();
      return;
    }
    // Foco preso no painel aberto: sem isto o Tab sai do menu e passeia pelo conteúdo que está
    // atrás dele — que continua visível, mas inalcançável pelo mouse.
    if (event.key !== 'Tab' || !mobile.matches) return;
    const focusaveis = [toggle, ...links];
    const primeiro = focusaveis[0];
    const ultimo = focusaveis.at(-1);
    const atual = document.activeElement;
    if (!focusaveis.includes(atual)) {
      event.preventDefault();
      primeiro.focus();
    } else if (event.shiftKey && atual === primeiro) {
      event.preventDefault();
      ultimo.focus();
    } else if (!event.shiftKey && atual === ultimo) {
      event.preventDefault();
      primeiro.focus();
    }
  };
  const onOutside = event => {
    if (open && !menu.contains(event.target) && !toggle.contains(event.target)) setOpen(false);
  };
  // Ao cruzar para o desktop, o menu volta ao estado de CSS puro.
  const onBreakpoint = () => {
    open = false;
    toggle.setAttribute('aria-expanded', 'false');
    if (label) label.textContent = 'Abrir menu';
    clearInline();
  };

  toggle.addEventListener('click', onToggle);
  links.forEach(link => link.addEventListener('click', onLink));
  document.addEventListener('keydown', onKey);
  document.addEventListener('click', onOutside);
  mobile.addEventListener('change', onBreakpoint);
  track(() => {
    toggle.removeEventListener('click', onToggle);
    links.forEach(link => link.removeEventListener('click', onLink));
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('click', onOutside);
    mobile.removeEventListener('change', onBreakpoint);
    clearInline();
    cancelAnimationFrame(limpezaFrame);
  });

  return { close: () => setOpen(false) };
}

function navIndicator(reduced, track) {
  const nav = $('[data-menu]');
  const indicator = $('[data-menu-indicator]');
  if (!nav || !indicator) return { setActive() {} };

  const links = $$('a[href^="#"]', nav);
  const desktop = window.matchMedia('(min-width: 860px)');
  let current = null;
  let visible = false;

  const place = instant => {
    const link = links.find(l => l.hash === `#${current}`);
    if (!desktop.matches) return;
    if (!link) {
      if (visible) animate(indicator, { opacity: 0 }, { duration: 0.25 });
      visible = false;
      return;
    }
    // Largura de layout do indicador (offsetWidth ignora transform, então não acumula entre trocas).
    const base = indicator.offsetWidth || 1;
    const target = { x: link.offsetLeft, scaleX: link.offsetWidth / base };
    if (instant || reduced || !visible) {
      animate(indicator, target, { duration: 0 });
      animate(indicator, { opacity: 1 }, { duration: reduced ? 0 : 0.3 });
    } else {
      animate(indicator, target, spring);
    }
    visible = true;
  };

  const observer = new ResizeObserver(() => place(true));
  observer.observe(nav);
  track(() => observer.disconnect());

  return {
    setActive(id) {
      if (id === current) return;
      current = id;
      links.forEach(link => {
        if (link.hash === `#${id}`) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
      place(false);
    },
  };
}

/**
 * Entrada escalonada de um grupo quando ele chega à tela.
 *
 * Com "reduzir movimento" nada é escondido: os elementos já estão no estado final, então a função
 * sai antes de tocar em qualquer estilo. O mesmo vale se este módulo falhar ao carregar — quem
 * esconde é o JavaScript, nunca o CSS, e por isso nada some sem o script para revelar de volta.
 */
function entradaEmSequencia(
  seletorGrupo,
  seletorItem,
  reduced,
  track,
  { y = 18, atraso = 0.08, duracao = 0.5, desfoque = 0, umaVez = false } = {},
) {
  const grupo = $(seletorGrupo);
  if (!grupo || reduced) return;
  const itens = $$(seletorItem, grupo);
  if (!itens.length) return;

  itens.forEach(el => (el.style.opacity = '0'));
  let feito = false;
  track(
    inView(
      grupo,
      () => {
        if (umaVez && feito) return;
        feito = true;
        const de = { opacity: [0, 1], y: [y, 0] };
        // filter é caro de animar; quem pediu blur passa o valor e só entra onde vale a pena.
        if (desfoque) de.filter = [`blur(${desfoque}px)`, 'blur(0px)'];
        animate(itens, de, { duration: duracao, ease: easeOut, delay: stagger(atraso) });
      },
      { margin: '0px 0px -12% 0px' },
    ),
  );
}

/** Rodapé: marca, colunas e parte legal entram em sequência, desfocando para nítido. */
function rodape(reduced, track, lowPower) {
  const raiz = $('[data-rodape]');
  if (!raiz) return;

  // Entra de cima e saindo de fora de foco, uma única vez. O desfoque é o que dá o efeito, mas
  // custa GPU: em aparelho fraco fica só o deslocamento, que sozinho já lê bem.
  entradaEmSequencia('[data-rodape]', '[data-rodape-item]', reduced, track, {
    y: -8,
    atraso: 0.1,
    duracao: 0.8,
    desfoque: lowPower ? 0 : 4,
    umaVez: true,
  });
}
