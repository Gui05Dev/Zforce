import { test, expect } from '@playwright/test';
import { contrastRatio, hiddenElements, scrollThrough, scrollToElement, watchConsole } from './helpers.js';

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 784, height: 900 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

for (const viewport of VIEWPORTS) {
  test(`layout ${viewport.width}px: sem erros, sem rolagem horizontal, conteúdo revelado na ida e na volta`, async ({ page }) => {
    const problems = watchConsole(page);
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.waitForTimeout(2000);

    await scrollThrough(page, 'down');
    expect(await hiddenElements(page)).toEqual([]);
    await scrollThrough(page, 'up');
    expect(await hiddenElements(page)).toEqual([]);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    // Topo fixo e estável depois de rolar a página inteira.
    expect(await page.locator('[data-topo]').evaluate(el => el.getBoundingClientRect().top)).toBe(0);

    await page.screenshot({ path: `test-results/shots/hero-${viewport.width}.png` });
    expect(problems).toEqual([]);
  });
}

test('ordem e numeração das seções', async ({ page }) => {
  await page.goto('/');
  const ids = await page.$$eval('main > section[id]', els => els.map(el => el.id));
  expect(ids).toEqual(['inicio', 'servicos', 'como-funciona', 'sobre', 'contato']);
  await expect(page.locator('main .rotulo > span')).toHaveText(['01', '02', '03', '04']);
  await expect(page.locator('#menu a')).toHaveText(['Serviços', 'Diagnóstico', 'Sobre', 'Contato']);
});

test('links de contato preservados', async ({ page }) => {
  await page.goto('/');
  // 14 links que já existiam + 5 botões "Estou com este problema" do diagnóstico
  await expect(page.locator('a[href^="https://wa.me/5545988037791?text="]')).toHaveCount(19);
  await expect(page.locator('a[href="tel:+5545988037791"]')).toHaveCount(3);
  await expect(page.locator('a[href="https://www.instagram.com/zforce_scooter/"]')).toHaveCount(2);
  await expect(page.locator('.problemas a')).toHaveCount(9);
  // Crédito exigido pela licença CC BY 4.0 do modelo 3D
  const credit = page.locator('.rodape-creditos');
  await expect(credit).toContainText('tonielpro520');
  await expect(credit.locator('a[href="https://creativecommons.org/licenses/by/4.0/"]')).toHaveCount(1);
  for (const link of await page.locator('a[target="_blank"]').all()) {
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  }
});

test('menu mobile: abre, fecha com Esc, fecha ao escolher um link', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const toggle = page.locator('[data-menu-toggle]');
  const firstLink = page.locator('#menu a').first();

  await expect(firstLink).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(firstLink).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
  await expect(firstLink).toBeHidden();

  await toggle.click();
  await page.locator('#menu a', { hasText: 'Sobre' }).click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(firstLink).toBeHidden();
  // A rolagem suave atravessa o diagnóstico enquanto ele inicializa o 3D: espera assentar.
  await expect.poll(() => page.locator('#sobre').evaluate(el => Math.round(el.getBoundingClientRect().top)), { timeout: 5000 }).toBeLessThan(120);
  await page.waitForTimeout(600);
  const top = await page.locator('#sobre').evaluate(el => el.getBoundingClientRect().top);
  const header = await page.locator('[data-topo]').evaluate(el => el.offsetHeight);
  expect(Math.abs(top - header)).toBeLessThanOrEqual(4);
});

test('menu volta ao normal ao passar de celular para desktop', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('[data-menu-toggle]').click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('#menu a').first()).toBeVisible();
  const inline = await page.locator('#menu').evaluate(el => el.getAttribute('style') || '');
  expect(inline).not.toContain('opacity');
});

test('menu desktop sem estouro entre 860px e 1180px', async ({ page }) => {
  for (const width of [860, 1000, 1180]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    const fits = await page.locator('.topo-linha').evaluate(el => el.scrollWidth <= el.clientWidth + 1);
    expect(fits, `topo em ${width}px`).toBe(true);
  }
});

test('números animam uma vez e terminam nos valores reais', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForTimeout(1200);
  await scrollToElement(page, '[data-stats]', 0.4);
  await page.waitForTimeout(2200);
  await expect(page.locator('[data-count]')).toHaveText(['3', '8', '4', '100']);
  await expect(page.locator('.numeros .sr-only')).toHaveText(['3', '8', '4', '100%']);
});

test('contraste dos textos secundários', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const selectors = [
    '.abertura-lead',
    '.servico-resumo',
    '.problemas span',
    '.diagnostico-card-resumo',
    '.diagnostico-sintoma',
    '.diagnostico-aviso',
    '.etapa p:last-child',
    '.numero-rotulo',
    '.contato-lista small',
  ];
  for (const selector of selectors) {
    expect(await contrastRatio(page, selector), selector).toBeGreaterThanOrEqual(6);
  }
});

test('teclado: skip link primeiro e foco visível', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
  // Tab real a partir do hero, ainda durante a entrada: nada animado pode sair da ordem de foco.
  await page.locator('.link-texto').first().focus();
  await expect(page.locator('.link-texto').first()).toBeFocused();
  const link = page.locator('.problemas a').first();
  for (let i = 0; i < 3 && !(await link.evaluate(el => el === document.activeElement)); i++) {
    await page.keyboard.press('Tab');
  }
  await expect(link).toBeFocused();
  const outline = await link.evaluate(el => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe('none');
  await page.waitForTimeout(1500);
  // O ScrollSmoother levou o foco para dentro da tela e o card foi revelado.
  const state = await link.evaluate(el => {
    const r = el.getBoundingClientRect();
    return { opacity: Number(getComputedStyle(el.closest('.servico')).opacity), inView: r.top >= 0 && r.bottom <= innerHeight };
  });
  expect(state).toEqual({ opacity: 1, inView: true });
});

test.describe('prefers-reduced-motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('conteúdo visível imediatamente, sem 3D, sem ScrollSmoother e com valores finais', async ({ page }) => {
    const problems = watchConsole(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForTimeout(300);
    await expect(page.locator('html')).not.toHaveClass(/(^|\s)anim(\s|$)/);
    await expect(page.locator('html')).not.toHaveClass(/has-smoother/);
    expect(await hiddenElements(page)).toEqual([]);
    await expect(page.locator('[data-hero-canvas] canvas')).toHaveCount(0);
    await expect(page.locator('[data-count]')).toHaveText(['3', '8', '4', '100']);
    const transform = await page.locator('#smooth-content').evaluate(el => getComputedStyle(el).transform);
    expect(transform).toBe('none');
    expect(problems).toEqual([]);
  });
});

test.describe('JavaScript desativado', () => {
  test.use({ javaScriptEnabled: false });

  test('todo o conteúdo e a navegação continuam acessíveis', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('html')).toHaveClass(/no-js/);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('#menu a').first()).toBeVisible();
    await expect(page.locator('.problemas a').first()).toBeVisible();
    await expect(page.locator('[data-count]').last()).toHaveText('100');
  });
});
