import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defineConfig } from 'vite';

// Seções geradas a partir de arquivos de dados (fonte única de textos, imagens e links):
// o marcador no index.html é trocado pelo HTML antes do processamento do Vite, então funciona no dev,
// no build e sem JavaScript no navegador.
const SECTIONS = [
  { marker: '<!-- @results -->', module: '/js/data/results.js', render: 'renderResults' },
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

export default defineConfig({
  // Caminhos relativos: o dist/ funciona em subpastas (GitHub Pages) e na raiz (Netlify/Vercel).
  base: './',
  plugins: [generatedSections()],
  build: {
    target: 'es2020',
    outDir: 'dist',
    // O chunk do Three.js é carregado sob demanda e passa do limite padrão de aviso.
    chunkSizeWarningLimit: 700,
  },
});
