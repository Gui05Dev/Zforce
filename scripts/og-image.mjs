// Gera a imagem do card de compartilhamento (WhatsApp, Facebook, LinkedIn).
//
//   npm run og:image
//
// Renderiza scripts/og-image.html num Chrome headless a 1200 × 630 (a proporção que os leitores de
// link recortam sem cortar texto) e grava public/assets/og-zforce.jpg. Em JPEG de propósito:
// alguns leitores ainda não abrem WebP e mostrariam o link sem imagem nenhuma.
//
// Rode de novo sempre que mudar a marca, o telefone ou a chamada principal do site.
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { ROOT } from './model-shared.mjs';
import { SITE } from '../js/data/site.js';

const OUTPUT = resolve(ROOT, 'public', SITE.og.src);
const TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.png': 'image/png',
};

const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  const file = path === '/' ? resolve(ROOT, 'scripts/og-image.html') : join(ROOT, path);
  if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise(done => server.listen(0, done));

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({
    viewport: { width: SITE.og.width, height: SITE.og.height },
    deviceScaleFactor: 1,
  });
  page.on('pageerror', error => console.error('erro na página:', error.message));
  await page.goto(`http://localhost:${server.address().port}/`);
  await page.waitForFunction(() => window.__pronto, null, { timeout: 30_000 });

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, await page.screenshot({ type: 'jpeg', quality: 88 }));

  console.log({
    imagem: OUTPUT.replace(ROOT, '.'),
    dimensoes: `${SITE.og.width} × ${SITE.og.height}`,
    tamanhoKB: Math.round(statSync(OUTPUT).size / 1024),
  });
} finally {
  await browser.close();
  server.close();
}
