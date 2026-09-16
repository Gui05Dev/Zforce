import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defineConfig } from 'vite';

// Seções geradas a partir de arquivos de dados (fonte única de textos, imagens e links):
// o marcador no index.html é trocado pelo HTML antes do processamento do Vite, então funciona no dev,
// no build e sem JavaScript no navegador.
const SECTIONS = [
  { marker: '<!-- @meta -->', module: '/js/data/site.js', render: 'renderMeta' },
  { marker: '<!-- @diagnostic -->', module: '/js/data/diagnostic.js', render: 'renderDiagnostic' },
];
// Editar estes arquivos recarrega a página (o HTML precisa ser gerado de novo).
const DATA_FILES = [...SECTIONS.map(s => s.module), '/js/data/contact.js'];

function generatedSections() {
  let root = process.cwd();
  return {
    name: 'zforce-generated-sections',
    configResolved(config) {
      root = config.root;
    },
    transformIndexHtml: {
      order: 'pre',
      async handler(html, ctx) {
        for (const section of SECTIONS) {
          if (!html.includes(section.marker)) continue;
          // No dev, carrega pelo servidor do Vite para refletir edições sem reiniciar.
          // No build, caminho absoluto: o config é empacotado em uma pasta temporária.
          const mod = ctx.server
            ? await ctx.server.ssrLoadModule(section.module)
            : await import(`${pathToFileURL(resolve(root, `.${section.module}`)).href}?t=${Date.now()}`);
          html = html.replace(section.marker, mod[section.render]());
        }
        return html;
      },
    },
    handleHotUpdate({ file, server }) {
      const normalized = file.replaceAll('\\', '/');
      if (DATA_FILES.some(module => normalized.endsWith(module))) {
        server.ws.send({ type: 'full-reload' });
        return [];
      }
    },
  };
}

/**
 * robots.txt e sitemap.xml gerados de js/data/site.js: o endereço do site fica em um arquivo só,
 * então trocar de domínio não deixa um sitemap apontando para o lugar errado.
 */
function seoFiles() {
  return {
    name: 'zforce-seo-files',
    apply: 'build',
    async generateBundle() {
      const { SITE } = await import(pathToFileURL(resolve(process.cwd(), 'js/data/site.js')).href);
      const lastmod = new Date().toISOString().slice(0, 10);
      // Domínio próprio: sem o CNAME no artefato publicado, um deploy pode derrubar a configuração
      // do repositório e o site volta a atender pelo endereço github.io.
      const host = new URL(SITE.url).host;
      if (!host.endsWith('.github.io')) {
        this.emitFile({ type: 'asset', fileName: 'CNAME', source: `${host}
` });
      }

      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *
Allow: /

Sitemap: ${new URL('sitemap.xml', SITE.url).href}
`,
      });
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          `  <url><loc>${SITE.url}</loc><lastmod>${lastmod}</lastmod></url>`,
          '</urlset>',
          '',
        ].join('\n'),
      });
    },
  };
}

export default defineConfig({
  // Caminhos relativos: o dist/ funciona em subpastas (GitHub Pages) e na raiz (Netlify/Vercel).
  base: './',
  plugins: [generatedSections(), seoFiles()],
  build: {
    target: 'es2020',
    outDir: 'dist',
    // O chunk do Three.js é carregado sob demanda e passa do limite padrão de aviso.
    chunkSizeWarningLimit: 700,
  },
});
