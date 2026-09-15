// Gera a imagem de fallback do Diagnóstico interativo e atualiza as posições dos pontos na configuração.
//
//   npm run diagnostic:poster
//
// Renderiza o modelo real (scene-otimizado.glb) com o próprio scooterViewer.js, na vista inicial
// definida em js/data/diagnostic.js, num Chrome com GPU (janela visível). Grava:
//   - assets/diagnostico/patinete-diagnostico.webp (1200 × 900, fundo transparente)
//   - os valores `poster: { x, y }` de cada componente em js/data/diagnostic.js
// Rode de novo sempre que mudar a vista inicial, a posição de um ponto ou o modelo.
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { ROOT } from './model-shared.mjs';

const OUTPUT = resolve(ROOT, 'assets/diagnostico/patinete-diagnostico.webp');
const CONFIG = resolve(ROOT, 'js/data/diagnostic.js');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.json': 'application/json' };

const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  const file = path === '/' ? resolve(ROOT, 'scripts/diagnostic-poster.html') : join(ROOT, path);
  if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise(done => server.listen(0, done));
const url = `http://localhost:${server.address().port}/`;

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-size=1300,1000'] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  page.on('pageerror', error => console.error('erro na página:', error.message));
  await page.goto(url);
  const result = await page.waitForFunction(() => window.__resultado, null, { timeout: 60_000 }).then(h => h.jsonValue());

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, Buffer.from(result.dataUrl.split(',')[1], 'base64'));

  let config = readFileSync(CONFIG, 'utf8');
  for (const { id, x, y } of result.positions) {
    const pattern = new RegExp(`(id: '${id}',[\\s\\S]*?poster: \\{ x: )[\\d.]+(, y: )[\\d.]+`);
    if (!pattern.test(config)) throw new Error(`componente "${id}" não encontrado em diagnostic.js`);
    config = config.replace(pattern, `$1${x}$2${y}`);
  }
  writeFileSync(CONFIG, config);

  console.log({
    imagem: OUTPUT.replace(ROOT, '.'),
    tamanhoKB: Math.round(statSync(OUTPUT).size / 1024),
    pontos: result.positions,
  });
} finally {
  await browser.close();
  server.close();
}
