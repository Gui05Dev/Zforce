// "Diagnóstico interativo" (seção #como-funciona): estado da seleção, card lateral e WhatsApp.
// Responsabilidades: Three.js (scooterViewer.js) = modelo, câmera, controles e posição dos hotspots;
// Motion (aqui) = troca do card e resposta dos botões; GSAP = só a revelação dos blocos no scroll.
// O HTML vem pronto do build (js/data/diagnostic.js), então sem JavaScript tudo continua legível.
import { animate, press } from 'motion';
import { CAMERA, COMPONENTS, MODEL, diagnosticUrl } from '../data/diagnostic.js';
import { getDiagnosticMode } from './env.js';

const $ = (sel, root) => root.querySelector(sel);
const $$ = (sel, root) => [...root.querySelectorAll(sel)];
const easeOut = [0.23, 1, 0.32, 1];

/**
 * @param {{ root: HTMLElement, env: object }} options
 */
export function initDiagnostic({ root, env }) {
  const stage = $('[data-diagnostic-stage]', root);
  if (!stage) return null;

  const canvasHost = $('[data-diagnostic-canvas]', stage);
  const poster = $('[data-diagnostic-poster]', stage);
  const status = $('[data-diagnostic-status]', stage);
  const hint = $('[data-diagnostic-hint]', stage);
  const selectButtons = $$('[data-select]', root);
  const cards = new Map($$('[data-card-component]', root).map(card => [card.dataset.cardComponent, card]));
  const hotspotElements = new Map($$('[data-hotspot]', stage).map(el => [el.dataset.hotspot, el]));
  const componentsById = new Map(COMPONENTS.map(c => [c.id, c]));
  const reduced = env.reducedMotion;
  const cleanups = [];

  root.classList.add('is-enhanced');

  let activeId = null;
  let viewer = null;
  let disposed = false;
  const symptomByComponent = new Map();

  // ---- Card lateral -------------------------------------------------------------------------
  const updateCta = id => {
    const card = cards.get(id);
    const cta = card && $('[data-diagnostic-cta]', card);
    if (cta) cta.href = diagnosticUrl(componentsById.get(id), symptomByComponent.get(id));
  };

  const showCard = (nextId, previousId) => {
    const next = cards.get(nextId);
    const previous = previousId && cards.get(previousId);
    if (!next || next === previous) return;
    next.classList.add('is-active');
    next.removeAttribute('inert');
    if (previous) {
      previous.setAttribute('inert', '');
      if (reduced) {
        previous.classList.remove('is-active');
      } else {
        animate(previous, { opacity: 0, y: -8 }, { duration: 0.14, ease: 'easeIn' }).then(() => {
          if (activeId !== previousId) previous.classList.remove('is-active');
        });
      }
    }
    if (reduced) {
      next.style.opacity = '1';
      return;
    }
    animate(next, { opacity: [0, 1], y: [10, 0] }, { duration: 0.28, delay: previous ? 0.08 : 0, ease: easeOut });
  };

  const select = (id, { focusModel = true } = {}) => {
    if (!componentsById.has(id) || id === activeId) return;
    const previousId = activeId;
    activeId = id;
    for (const button of selectButtons) {
      const on = button.dataset.select === id;
      button.setAttribute('aria-pressed', String(on));
    }
    hotspotElements.forEach((el, key) => el.classList.toggle('is-active', key === id));
    showCard(id, previousId);
    if (focusModel && viewer) viewer.focus(id);
  };

  // ---- Eventos (um listener delegado para toda a seção) -------------------------------------
  const onClick = event => {
    const selectButton = event.target.closest('[data-select]');
    if (selectButton && root.contains(selectButton)) {
      select(selectButton.dataset.select);
      return;
    }
    const symptomButton = event.target.closest('[data-symptom]');
    if (symptomButton) {
      const card = symptomButton.closest('[data-card-component]');
      const id = card.dataset.cardComponent;
      const already = symptomButton.getAttribute('aria-pressed') === 'true';
      $$('[data-symptom]', card).forEach(b => b.setAttribute('aria-pressed', 'false'));
      if (already) symptomByComponent.delete(id);
      else {
        symptomButton.setAttribute('aria-pressed', 'true');
        symptomByComponent.set(id, symptomButton.dataset.symptom);
      }
      updateCta(id);
    }
  };
  root.addEventListener('click', onClick);
  cleanups.push(() => root.removeEventListener('click', onClick));

  // Resposta tátil dos botões (Motion). Hotspot: o <button> interno; a posição é do Three.js.
  const pressTargets = [...selectButtons, ...$$('[data-symptom]', root)];
  cleanups.push(
    press(pressTargets, element => {
      if (reduced) return undefined;
      animate(element, { scale: 0.94 }, { type: 'spring', stiffness: 700, damping: 30 });
      return () => animate(element, { scale: 1 }, { type: 'spring', stiffness: 520, damping: 18 });
    }),
  );

  // Estado inicial: primeiro componente selecionado, links com a mensagem base.
  COMPONENTS.forEach(c => updateCta(c.id));
  cards.forEach(card => card.setAttribute('inert', ''));
  select(COMPONENTS[0].id, { focusModel: false });

  // ---- Modelo 3D ou imagem ilustrativa ------------------------------------------------------
  const setStatus = text => {
    status.textContent = text;
    status.hidden = !text;
  };

  const useImage = message => {
    stage.classList.remove('is-loading', 'is-3d');
    stage.classList.add('is-image');
    if (poster) poster.loading = 'eager';
    setStatus(message || '');
  };

  const mode = getDiagnosticMode({ webgl: env.hasWebGL(), saveData: env.saveData, lowPower: env.lowPower });
  if (mode === 'imagem') {
    useImage(env.saveData ? 'Economia de dados ativa: exibindo imagem ilustrativa.' : '');
  } else {
    stage.classList.add('is-loading');
    let started = false;
    const observer = new IntersectionObserver(
      entries => {
        if (started || !entries.some(entry => entry.isIntersecting)) return;
        started = true;
        observer.disconnect();
        if (poster) poster.loading = 'eager';
        setStatus('Carregando modelo 3D…');
        import('./scooterViewer.js')
          .then(({ createScooterViewer }) =>
            createScooterViewer({
              container: canvasHost,
              stage,
              components: COMPONENTS,
              hotspotElements,
              camera: CAMERA,
              urls: [MODEL.otimizado],
              reducedMotion: reduced,
              touch: env.touchOnly,
              onProgress: ratio => setStatus(`Carregando modelo 3D… ${Math.round(ratio * 100)}%`),
              onInteract: () => hint?.classList.add('is-hidden'),
            }),
          )
          .then(instance => {
            if (disposed) {
              instance.destroy();
              return;
            }
            viewer = instance;
            viewer.onLost(() => {
              viewer = null;
              useImage('O modelo 3D foi interrompido. Exibindo imagem ilustrativa.');
            });
            stage.classList.remove('is-loading');
            stage.classList.add('is-3d');
            setStatus('');
            if (activeId && activeId !== COMPONENTS[0].id) viewer.focus(activeId);
          })
          .catch(error => {
            console.warn('[z-force] modelo 3D do diagnóstico indisponível, exibindo imagem', error);
            useImage('Não foi possível carregar o modelo 3D. Exibindo imagem ilustrativa.');
          });
      },
      // Começa a baixar um pouco antes de a seção entrar na tela.
      { rootMargin: '500px 0px' },
    );
    observer.observe(stage);
    cleanups.push(() => observer.disconnect());
  }

  return {
    select,
    get viewer() {
      return viewer;
    },
    destroy() {
      disposed = true;
      viewer?.destroy();
      viewer = null;
      cleanups.forEach(fn => fn());
      root.classList.remove('is-enhanced');
      stage.classList.remove('is-loading', 'is-3d', 'is-image');
      cards.forEach(card => {
        card.classList.remove('is-active');
        card.removeAttribute('inert');
        card.style.opacity = '';
        card.style.transform = '';
      });
    },
  };
}
