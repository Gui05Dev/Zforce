import { test, expect } from '@playwright/test';

test.use({ launchOptions: { args: ['--disable-3d-apis', '--disable-webgl'] } });

test('sem WebGL: mantém o fundo em CSS e não gera erros', async ({ page }) => {
  const problems = [];
  page.on('console', msg => ['error', 'warning'].includes(msg.type()) && problems.push(msg.text()));
  page.on('pageerror', error => problems.push(error.message));

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForTimeout(2500);

  expect(await page.evaluate(() => !!document.createElement('canvas').getContext('webgl'))).toBe(false);
  await expect(page.locator('html')).toHaveClass(/sem-3d/);
  await expect(page.locator('[data-hero-canvas] canvas')).toHaveCount(0);
  await expect(page.locator('.fundo-css')).toBeVisible();
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('.traco circle').first()).toBeVisible();
  // Sem WebGL o desenho SVG permanece e o patinete 3D nem é carregado.
  await expect(page.locator('.desenho-rotulos')).toHaveCount(0);
  expect(await page.locator('[data-hero-drawing]').evaluate(el => Number(getComputedStyle(el).opacity))).toBe(1);
  expect(await page.evaluate(() => performance.getEntriesByType('resource').some(e => e.name.includes('.glb')))).toBe(false);
  expect(problems).toEqual([]);
});

test('sem WebGL: diagnóstico usa a imagem ilustrativa, não baixa o modelo e mantém os pontos no palco', async ({ page }) => {
  const problems = [];
  page.on('console', msg => ['error', 'warning'].includes(msg.type()) && problems.push(msg.text()));
  page.on('pageerror', error => problems.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const el = document.querySelector('.diagnostico');
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 90, behavior: 'instant' });
  });
  await page.waitForTimeout(1300);

  const stage = page.locator('[data-diagnostic-stage]');
  await expect(stage).toHaveClass(/is-image/);
  await expect(page.locator('[data-diagnostic-poster]')).toBeVisible();
  await expect(page.locator('[data-diagnostic-canvas] canvas')).toHaveCount(0);
  expect(await page.evaluate(() => performance.getEntriesByType('resource').some(e => e.name.includes('xiaomi-scooter/scene')))).toBe(false);

  const box = await stage.boundingBox();
  for (const button of await page.locator('.diagnostico-ponto-botao').all()) {
    const b = await button.boundingBox();
    expect(b.x).toBeGreaterThanOrEqual(box.x);
    expect(b.x + b.width).toBeLessThanOrEqual(box.x + box.width);
    expect(b.y).toBeGreaterThanOrEqual(box.y);
    expect(b.y + b.height).toBeLessThanOrEqual(box.y + box.height);
  }
  // Interação continua disponível no modo imagem.
  await page.locator('[data-hotspot="motor"] button').click();
  await expect(page.locator('[data-card-component="motor"]')).toBeVisible();
  await expect(page.locator('.diagnostico-aviso')).toHaveText('Modelo meramente ilustrativo.');
  expect(problems).toEqual([]);
});
