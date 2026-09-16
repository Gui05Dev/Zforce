// Trava do hero (index.html + .anim-fallback no CSS).
//
// O h1, o texto e o botão do WhatsApp começam em opacity: 0 esperando o bundle de animação
// (~96 KB gzip). Se ele demorar, o CSS revela o hero sozinho em 1,2 s — e o GSAP, ao chegar
// atrasado, não pode escondê-lo de novo para reanimar.
//
// O que estes testes garantem é o comportamento visível: o hero aparece antes do bundle e não
// pisca depois. Hoje há duas defesas para isso — a checagem de `.anim` em gsapScrollAnimations.js
// e o `animation-fill-mode: both` do fade, que tem precedência sobre o estilo inline do GSAP —
// e o teste não distingue uma da outra: ele falha se as duas caírem juntas.
import { test, expect } from '@playwright/test';
import { watchConsole } from './helpers.js';

const CHUNK = /\/assets\/index-[\w-]+\.js$/;
const animReady = () => document.documentElement.classList.contains('anim-ready');

// Observa todos os elementos que o CSS esconde, não só o título: no heroIntro o <h1> recebe
// `set(opacity: 1)` e só as linhas internas deslizam, enquanto o texto e o bloco do botão do
// WhatsApp ([data-hero-item]) é que levam fromTo({opacity: 0}). Medir só o h1 não veria o piscar.
const ALVOS = '.abertura .js-hero';

/** Espera o fade do CSS existir e terminar em todos os alvos. */
function fadeConcluido() {
  const els = [...document.querySelectorAll('.abertura .js-hero')];
  // `length > 0` é essencial: no instante entre a troca de classes e o primeiro quadro da animação
  // a lista está vazia e o opacity já é 1 — sem isso a espera termina no meio do fade.
  return els.every(el => {
    const anims = el.getAnimations();
    return anims.length > 0 && anims.every(a => a.playState === 'finished') && getComputedStyle(el).opacity === '1';
  });
}

/**
 * Menor opacidade entre os alvos, de agora até `depoisMs` após o GSAP assumir.
 *
 * A janela precisa ir ALÉM de `anim-ready`: o main.js marca a classe assim que
 * initScrollAnimations() retorna, e a timeline do GSAP só pinta o primeiro quadro no rAF
 * seguinte. Parar em `anim-ready` faria o teste passar mesmo com o hero piscando.
 */
async function watchOpacity(page, depoisMs = 1500) {
  await page.evaluate(
    ([seletor, ms]) => {
      const els = [...document.querySelectorAll(seletor)];
      window.__minOpacity = 1;
      window.__watchDone = false;
      let fim = null;
      const tick = () => {
        for (const el of els) window.__minOpacity = Math.min(window.__minOpacity, Number(getComputedStyle(el).opacity));
        if (fim === null && document.documentElement.classList.contains('anim-ready')) fim = performance.now() + ms;
        if (fim !== null && performance.now() > fim) {
          window.__watchDone = true;
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    [ALVOS, depoisMs],
  );

  return async () => {
    await page.waitForFunction(() => window.__watchDone, null, { timeout: 25_000 });
    return page.evaluate(() => window.__minOpacity);
  };
}

test('JS lento: a trava revela o hero e o GSAP atrasado não o esconde de novo', async ({ page }) => {
  const problems = watchConsole(page);
  // Atrasa o bundle de animação para além da trava de 1,2 s.
  await page.route(CHUNK, async route => {
    await new Promise(resolve => setTimeout(resolve, 2500));
    await route.continue();
  });
  await page.setViewportSize({ width: 1440, height: 900 });

  const inicio = Date.now();
  await page.goto('/', { waitUntil: 'commit' });

  // Revelado pelo CSS bem antes de o bundle chegar (1,2 s de trava + 0,5 s de fade).
  await page.waitForFunction(fadeConcluido, null, { timeout: 4000 });
  expect(Date.now() - inicio, 'hero visível antes do bundle de animação').toBeLessThan(2400);
  await expect(page.locator('html')).toHaveClass(/anim-fallback/);

  // A partir daqui o bundle chega: nada do hero pode voltar a sumir.
  const minOpacity = await watchOpacity(page);
  expect(await minOpacity(), 'o hero piscou quando o GSAP assumiu').toBeGreaterThan(0.9);

  // E o resto do site segue normal: o botão principal continua de pé.
  await expect(page.locator('.abertura-acoes .botao')).toBeVisible();
  expect(problems).toEqual([]);
});

test('JS no tempo normal: quem revela o hero é o GSAP, sem a trava do CSS', async ({ page }) => {
  const problems = watchConsole(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForFunction(animReady, null, { timeout: 20_000 });

  await expect(page.locator('html')).not.toHaveClass(/anim-fallback/);
  await expect(page.locator('[data-hero-title]')).toHaveCSS('opacity', '1');
  await expect(page.locator('.abertura-acoes .botao')).toBeVisible();
  expect(problems).toEqual([]);
});
