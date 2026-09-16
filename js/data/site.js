// Identidade pública do site: endereço, textos de compartilhamento e dados do negócio.
// Fonte única — o <head> do index.html é gerado a partir daqui pelo plugin em vite.config.js
// (marcador <!-- @meta -->), então título, descrição, Open Graph e JSON-LD nunca saem de sincronia.
//
// Para publicar em outro domínio, mude apenas `url`: os caminhos das páginas continuam relativos
// (base './' no vite.config.js) e só as metas precisam do endereço absoluto.
import { WHATSAPP_NUMBER } from './contact.js';

/** Endereço público do site, sempre com barra no fim (serve de base para as URLs absolutas). */
const URL_BASE = 'https://gui05dev.github.io/Zforce/';

export const SITE = {
  url: URL_BASE,
  nome: 'Z-Force Mobilidade Elétrica',
  titulo: 'Z-Force | Conserto de patinete e bike elétrica em Cafelândia-PR',
  descricao:
    'Conserto de patinetes, scooters e bicicletas elétricas em Cafelândia-PR. Orçamento pelo WhatsApp antes ' +
    'do serviço, retirada e entrega a combinar.',
  // Texto curto para o card de compartilhamento (WhatsApp, Instagram, Facebook): cabe em duas linhas.
  descricaoCurta: 'Conserto de patinete, scooter e bike elétrica em Cafelândia-PR. Fale com a Z-Force pelo WhatsApp.',
  cidade: 'Cafelândia',
  estado: 'PR',
  telefone: `+${WHATSAPP_NUMBER}`,
  telefoneVisivel: '(45) 98803-7791',
  instagram: 'https://www.instagram.com/zforce_scooter/',

  // Imagem do card de compartilhamento. Gerada por `npm run og:image` (scripts/og-image.mjs).
  // 1200×630 é a proporção que WhatsApp, Facebook e LinkedIn recortam sem cortar o texto.
  // JPEG em vez de WebP de propósito: alguns leitores de link ainda não abrem WebP.
  og: {
    src: 'assets/og-zforce.jpg',
    type: 'image/jpeg',
    width: 1200,
    height: 630,
    alt: 'Z-Force Mobilidade Elétrica — conserto de patinete, scooter e bike elétrica em Cafelândia, Paraná.',
  },
};

/** Transforma um caminho relativo do site em URL absoluta (exigido pelo Open Graph). */
export const absoluteUrl = path => new URL(path, URL_BASE).href;

const escapeHtml = value =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

/**
 * Dados estruturados do negócio local (schema.org). É o que alimenta o painel do Google Maps/Busca.
 *
 * Campos deixados de fora de propósito, porque não temos o dado confirmado e inventá-los seria pior
 * do que omiti-los (o Google penaliza horário errado): `openingHoursSpecification`, `geo`,
 * `priceRange` e `streetAddress`. Para preencher depois, veja o README.
 */
export function businessJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': absoluteUrl('#negocio'),
    name: SITE.nome,
    description: 'Conserto de patinetes, scooters e bicicletas elétricas.',
    url: SITE.url,
    image: absoluteUrl(SITE.og.src),
    telephone: SITE.telefone,
    address: {
      '@type': 'PostalAddress',
      addressLocality: SITE.cidade,
      addressRegion: SITE.estado,
      addressCountry: 'BR',
    },
    areaServed: `${SITE.cidade}-${SITE.estado}`,
    sameAs: [SITE.instagram],
  };
}

/**
 * HTML do <head> que depende da identidade do site: título, descrição, canônica, Open Graph,
 * Twitter Card e JSON-LD. Gerado no build (Node, sem DOM) e injetado no lugar de <!-- @meta -->.
 */
export function renderMeta() {
  const e = escapeHtml;
  const og = absoluteUrl(SITE.og.src);
  return `<title>${e(SITE.titulo)}</title>
  <meta name="description" content="${e(SITE.descricao)}">
  <link rel="canonical" href="${e(SITE.url)}">

  <!-- Card de compartilhamento (WhatsApp é o canal principal do negócio) -->
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${e(SITE.nome)}">
  <meta property="og:locale" content="pt_BR">
  <meta property="og:url" content="${e(SITE.url)}">
  <meta property="og:title" content="${e(SITE.nome)}">
  <meta property="og:description" content="${e(SITE.descricaoCurta)}">
  <meta property="og:image" content="${e(og)}">
  <meta property="og:image:type" content="${e(SITE.og.type)}">
  <meta property="og:image:width" content="${SITE.og.width}">
  <meta property="og:image:height" content="${SITE.og.height}">
  <meta property="og:image:alt" content="${e(SITE.og.alt)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${e(SITE.nome)}">
  <meta name="twitter:description" content="${e(SITE.descricaoCurta)}">
  <meta name="twitter:image" content="${e(og)}">

  <script type="application/ld+json">${JSON.stringify(businessJsonLd())}</script>`;
}
