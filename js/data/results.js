// Fonte única dos dados da seção "Resultados reais".
// Usada em dois lugares: no build (vite.config.js gera o HTML da seção) e no navegador
// (js/modules/gallery.js monta o PhotoSwipe). Nenhum caminho de imagem fica espalhado.
//
// ATENÇÃO: todas as imagens abaixo são PLACEHOLDERS de desenvolvimento (placeholder: true).
// Não existem, no projeto, fotos reais de antes/depois de um mesmo reparo.
// Para publicar: troque os arquivos em public/assets/resultados/, atualize textos e
// dimensões reais e mude `placeholder` para false. Veja o README.
//
// Caminhos são relativos (sem "/" inicial) porque o build usa base "./".
// As imagens ficam em public/, então não recebem hash e servem tanto ao HTML quanto ao JS.

const DIR = 'assets/resultados';

/** Pares de antes/depois. O primeiro item aparece no comparador. */
export const repairProjects = [
  {
    id: 'reparo-exemplo-01',
    placeholder: true,
    title: 'Exemplo de desenvolvimento',
    description: 'Par provisório. Substituir por fotos reais do mesmo veículo, antes e depois do mesmo reparo.',
    before: {
      src: `${DIR}/reparo-exemplo-01-antes-1200.webp`,
      large: `${DIR}/reparo-exemplo-01-antes-1920.webp`,
      width: 1920,
      height: 1280,
      alt: 'Imagem provisória de desenvolvimento, lado "antes": ilustração de um patinete, não é um reparo real.',
    },
    after: {
      src: `${DIR}/reparo-exemplo-01-depois-1200.webp`,
      large: `${DIR}/reparo-exemplo-01-depois-1920.webp`,
      width: 1920,
      height: 1280,
      alt: 'Imagem provisória de desenvolvimento, lado "depois": ilustração de um patinete, não é um reparo real.',
    },
  },
];

/** Miniaturas da galeria (máximo de quatro exibidas). */
export const galleryItems = [
  { id: 'galeria-exemplo-01', placeholder: true, caption: 'Placeholder 1 · substituir por foto real de serviço', alt: 'Imagem provisória de desenvolvimento número 1, sem foto real de serviço.' },
  { id: 'galeria-exemplo-02', placeholder: true, caption: 'Placeholder 2 · substituir por foto real de serviço', alt: 'Imagem provisória de desenvolvimento número 2, sem foto real de serviço.' },
  { id: 'galeria-exemplo-03', placeholder: true, caption: 'Placeholder 3 · substituir por foto real de serviço', alt: 'Imagem provisória de desenvolvimento número 3, sem foto real de serviço.' },
  { id: 'galeria-exemplo-04', placeholder: true, caption: 'Placeholder 4 · substituir por foto real de serviço', alt: 'Imagem provisória de desenvolvimento número 4, sem foto real de serviço.' },
].map(item => ({
  ...item,
  thumb: { src: `${DIR}/${item.id}-640.webp`, width: 640, height: 480 },
  large: { src: `${DIR}/${item.id}-1600.webp`, width: 1600, height: 1200 },
}));

export const MAX_GALLERY_ITEMS = 4;

export const hasPlaceholders = () =>
  [...repairProjects, ...galleryItems].some(item => item.placeholder);

/** Lista de todos os arquivos esperados (usada no teste que confere se existem). */
export function listResultFiles() {
  return [
    ...repairProjects.flatMap(p => [p.before.src, p.before.large, p.after.src, p.after.large]),
    ...galleryItems.flatMap(g => [g.thumb.src, g.large.src]),
  ];
}

const escapeHtml = value =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

/**
 * Gera o miolo da seção. Executado no build (Node), sem DOM.
 * @returns {string} HTML
 */
export function renderResults({ projects = repairProjects, gallery = galleryItems } = {}) {
  const project = projects[0];
  const items = gallery.slice(0, MAX_GALLERY_ITEMS);
  const e = escapeHtml;
  const sizes = '(min-width: 1000px) 58vw, 100vw';
  const srcset = side => `${e(side.src)} 1200w, ${e(side.large)} 1920w`;

  const notice = hasPlaceholders()
    ? `<p class="aviso-dev" role="note"><strong>Em desenvolvimento:</strong> imagens provisórias, não são serviços reais. Substituir por fotos reais antes de publicar.</p>`
    : '';

  const comparison = project
    ? `
        <figure class="comparador" data-reveal-block>
          <div class="comparador-moldura">
            <img-comparison-slider class="comparador-slider" value="50" keyboard="disabled" data-comparison-slider
              aria-label="Comparação antes e depois: ${e(project.title)}. Arraste ou use as setas do teclado para mover o divisor.">
              <div slot="first" class="comparador-lado">
                <img src="${e(project.before.src)}" srcset="${srcset(project.before)}" sizes="${sizes}"
                  width="1200" height="800" alt="${e(project.before.alt)}" loading="lazy" decoding="async" draggable="false">
                <span class="comparador-rotulo comparador-rotulo--antes" aria-hidden="true">Antes</span>
              </div>
              <div slot="second" class="comparador-lado">
                <img src="${e(project.after.src)}" srcset="${srcset(project.after)}" sizes="${sizes}"
                  width="1200" height="800" alt="${e(project.after.alt)}" loading="lazy" decoding="async" draggable="false">
                <span class="comparador-rotulo comparador-rotulo--depois" aria-hidden="true">Depois</span>
              </div>
              <span slot="handle" class="comparador-alca" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M9 6 3 12l6 6M15 6l6 6-6 6"/></svg>
              </span>
            </img-comparison-slider>
          </div>
          <figcaption class="comparador-legenda">
            <span class="comparador-texto"><strong>${e(project.title)}</strong> ${e(project.description)}</span>
            <button type="button" class="botao botao--secundario" data-open-pair="0">
              <svg class="botao-icone" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>
              Ver imagens ampliadas
            </button>
          </figcaption>
        </figure>`
    : '';

  const thumbs = items
    .map(
      (item, index) => `
          <li class="galeria-item" data-reveal-block>
            <a class="galeria-link" href="${e(item.large.src)}" data-gallery-index="${index}"
              aria-label="Ampliar imagem ${index + 1} de ${items.length}: ${e(item.caption)}">
              <img src="${e(item.thumb.src)}" width="${item.thumb.width}" height="${item.thumb.height}"
                alt="${e(item.alt)}" loading="lazy" decoding="async">
              <span class="galeria-legenda" aria-hidden="true">${e(item.caption)}</span>
            </a>
          </li>`,
    )
    .join('');

  return `${notice}
      <div class="resultados-grade">${comparison}
        <ul class="galeria" aria-label="Galeria de serviços" data-gallery>${thumbs}
        </ul>
      </div>`;
}
