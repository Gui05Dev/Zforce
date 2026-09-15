// PhotoSwipe: galeria, zoom e lightbox. Uma única instância atende as miniaturas e o par antes/depois.
// Este módulo é importado sob demanda; o núcleo do PhotoSwipe só baixa quando algo é aberto.
// Os dados vêm da mesma configuração que gerou o HTML (js/data/results.js).
import PhotoSwipeLightbox from 'photoswipe/lightbox';
import 'photoswipe/style.css';
import { galleryItems, MAX_GALLERY_ITEMS, repairProjects } from '../data/results.js';

/**
 * @param {{ onOpen?: () => void, onClose?: () => void }} options
 */
export function createGallery({ onOpen = () => {}, onClose = () => {} } = {}) {
  const lightbox = new PhotoSwipeLightbox({
    pswpModule: () => import('photoswipe'),
    bgOpacity: 0.94,
    showHideAnimationType: 'zoom',
    // Durante a abertura o PhotoSwipe ignora cliques e teclas: transição curta = resposta rápida.
    showAnimationDuration: 280,
    hideAnimationDuration: 280,
    padding: { top: 56, bottom: 72, left: 16, right: 16 },
    wheelToZoom: true,
    returnFocus: true,
    trapFocus: true,
    indexIndicatorSep: ' de ',
    closeTitle: 'Fechar (Esc)',
    zoomTitle: 'Ampliar ou reduzir',
    arrowPrevTitle: 'Imagem anterior',
    arrowNextTitle: 'Próxima imagem',
    errorMsg: 'A imagem não pôde ser carregada.',
  });

  // Legenda verdadeira, lida do item aberto e anunciada a leitores de tela.
  lightbox.on('uiRegister', () => {
    lightbox.pswp.ui.registerElement({
      name: 'legenda',
      order: 9,
      isButton: false,
      appendTo: 'root',
      onInit: (el, pswp) => {
        el.setAttribute('aria-live', 'polite');
        const update = () => {
          el.textContent = pswp.currSlide?.data.caption || '';
        };
        pswp.on('change', update);
        update();
      },
    });
  });

  // Enquanto o lightbox está aberto, a rolagem suave da página fica pausada.
  lightbox.on('beforeOpen', onOpen);
  lightbox.on('destroy', onClose);
  lightbox.init();

  const thumbElement = index => document.querySelector(`[data-gallery-index="${index}"] img`);

  const gallerySource = () =>
    galleryItems.slice(0, MAX_GALLERY_ITEMS).map((item, index) => ({
      src: item.large.src,
      width: item.large.width,
      height: item.large.height,
      msrc: item.thumb.src, // miniatura já carregada serve de prévia na animação de abertura
      alt: item.alt,
      caption: item.caption,
      element: thumbElement(index),
    }));

  const pairSource = projectIndex => {
    const project = repairProjects[projectIndex];
    if (!project) return [];
    return [
      { side: project.before, label: 'Antes' },
      { side: project.after, label: 'Depois' },
    ].map(({ side, label }) => ({
      src: side.large,
      width: side.width,
      height: side.height,
      msrc: side.src,
      alt: side.alt,
      caption: `${label} · ${project.title}. ${project.description}`,
    }));
  };

  return {
    openGallery: index => lightbox.loadAndOpen(index, gallerySource()),
    openPair: projectIndex => lightbox.loadAndOpen(0, pairSource(projectIndex)),
    destroy: () => lightbox.destroy(),
  };
}
