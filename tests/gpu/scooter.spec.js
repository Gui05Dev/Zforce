// Testes que precisam de GPU real (o Chrome headless recusa WebGL por software de propósito).
// Rodam com janela visível:  npm run test:gpu
import { test, expect } from '@playwright/test';

function watchConsole(page) {
  const problems = [];
  page.on('console', msg => ['error', 'warning'].includes(msg.type()) && problems.push(msg.text()));
  page.on('pageerror', error => problems.push(error.message));
  return problems;
}

test('desktop: o desenho técnico se transforma no patinete 3D, sem repetir os nomes das peças', async ({ page }) => {
  const problems = watchConsole(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const figure = page.locator('[data-hero-figure]');
  const svg = page.locator('[data-hero-drawing]');
  await expect(page.locator('[data-hero-canvas] canvas')).toHaveCount(1);
  await expect(figure).toHaveAttribute('data-modelo3d', 'ativo', { timeout: 15_000 });
  await expect.poll(() => svg.evaluate(el => Number(getComputedStyle(el).opacity)), { timeout: 5_000 }).toBe(0);
  // O SVG continua no DOM: segue sendo a descrição acessível da figura.
  await expect(svg).toHaveAttribute('role', 'img');

  // Sem nomes de peças no hero: o detalhamento fica no Diagnóstico interativo.
  await expect(page.locator('.desenho-rotulos')).toHaveCount(0);

  // Sem quedas de quadro relevantes com fundo + patinete.
  const fps = await page.evaluate(
    () =>
      new Promise(resolve => {
        let frames = 0;
        const start = performance.now();
        const tick = now => {
          frames++;
          if (now - start < 2000) requestAnimationFrame(tick);
          else resolve(frames / 2);
        };
        requestAnimationFrame(tick);
      }),
  );
  expect(fps).toBeGreaterThan(45);
  expect(problems).toEqual([]);
});

test('celular: não baixa o modelo e mantém o desenho SVG', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const problems = watchConsole(page);
  await page.goto('/');
  await page.waitForTimeout(5000);
  await expect(page.locator('[data-hero-figure]')).not.toHaveAttribute('data-modelo3d', 'ativo');
  expect(await page.locator('[data-hero-drawing]').evaluate(el => Number(getComputedStyle(el).opacity))).toBe(1);
  const glbRequests = await page.evaluate(() => performance.getEntriesByType('resource').filter(e => e.name.includes('.glb')).length);
  expect(glbRequests).toBe(0);
  expect(problems).toEqual([]);
  await context.close();
});
