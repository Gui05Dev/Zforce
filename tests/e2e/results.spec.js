import { test, expect } from '@playwright/test';
import { scrollToElement, watchConsole } from './helpers.js';

const pswp = page => page.locator('.pswp');
const counter = page => page.locator('.pswp__counter');
const caption = page => page.locator('.pswp__legenda');
// Durante a animação de abertura o PhotoSwipe ignora cliques e teclas; ao terminar, o foco entra nele.
const waitOpen = page => expect(page.locator('.pswp')).toBeFocused();

async function gotoResults(page, viewport = { width: 1440, height: 900 }) {
  const problems = watchConsole(page);
  await page.setViewportSize(viewport);
  await page.goto('/');
  await page.waitForTimeout(800);
  await scrollToElement(page, '#resultados', 0.02);
  await expect(page.locator('[data-comparison-slider]')).toHaveClass(/rendered/);
  return problems;
}

test('comparador: rótulos, ARIA, teclado e arraste sem abrir a galeria', async ({ page }) => {
  const problems = await gotoResults(page);
  const slider = page.locator('[data-comparison-slider]');

  await expect(slider).toHaveAttribute('role', 'slider');
  await expect(slider).toHaveAttribute('aria-label', /antes e depois/i);
  await expect(slider).toHaveAttribute('aria-valuenow', '50');
  await expect(page.locator('.comparador-rotulo--antes')).toHaveText(/antes/i);
  await expect(page.locator('.comparador-rotulo--depois')).toHaveText(/depois/i);
  await expect(page.locator('.comparador-lado img').first()).toHaveAttribute('alt', /.{20,}/);

  // Teclado
  await slider.focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', '80');
  await page.keyboard.press('Home');
  await expect(slider).toHaveAttribute('aria-valuenow', '0');
  await page.keyboard.press('PageUp');
  await expect(slider).toHaveAttribute('aria-valuenow', '10');

  // Mouse: arrasta o divisor para 25%
  const box = await slider.boundingBox();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const value = Number(await slider.getAttribute('aria-valuenow'));
  expect(value).toBeGreaterThan(18);
  expect(value).toBeLessThan(32);

  await expect(pswp(page)).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('galeria: imagem grande só ao abrir, legenda, contador, setas, zoom, Esc e foco devolvido', async ({ page }) => {
  const problems = await gotoResults(page);
  const loadedLarge = () =>
    page.evaluate(() => performance.getEntriesByType('resource').filter(e => /galeria-exemplo-0\d-1600\.webp/.test(e.name)).length);
  expect(await loadedLarge()).toBe(0);

  const thumb = page.locator('.galeria-link').first();
  await thumb.click();
  await waitOpen(page);
  await expect(counter(page)).toHaveText('1 de 4');
  await expect(caption(page)).toContainText('Placeholder 1');
  await page.waitForTimeout(500);
  expect(await loadedLarge()).toBeGreaterThan(0);

  await page.keyboard.press('ArrowRight');
  await expect(counter(page)).toHaveText('2 de 4');
  await expect(caption(page)).toContainText('Placeholder 2');
  await page.keyboard.press('ArrowLeft');
  await expect(counter(page)).toHaveText('1 de 4');

  await page.locator('.pswp__button--zoom').click();
  await expect(pswp(page)).toHaveClass(/pswp--zoomed-in/);

  // A página não rola por baixo do lightbox.
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(300);

  await page.keyboard.press('Escape');
  await expect(pswp(page)).toHaveCount(0);
  await expect(thumb).toBeFocused();
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - scrollBefore)).toBeLessThanOrEqual(2);
  expect(problems).toEqual([]);
});

test('galeria: abrir e fechar repetidamente não duplica instâncias', async ({ page }) => {
  const problems = await gotoResults(page);
  for (let round = 0; round < 4; round++) {
    await page.locator('.galeria-link').nth(round).click();
    await waitOpen(page);
    await expect(pswp(page)).toHaveCount(1);
    await expect(counter(page)).toHaveText(`${round + 1} de 4`);
    await page.locator('.pswp__button--close').click();
    await expect(pswp(page)).toHaveCount(0);
  }
  // O módulo da galeria foi baixado uma única vez.
  const galleryChunks = await page.evaluate(
    () => performance.getEntriesByType('resource').filter(e => /\/gallery-[\w-]+\.js/.test(e.name)).length,
  );
  expect(galleryChunks).toBe(1);
  expect(problems).toEqual([]);
});

test('galeria: gesto de arrastar navega e o teclado abre pela miniatura', async ({ page }) => {
  await gotoResults(page);
  await page.locator('.galeria-link').nth(1).focus();
  await page.keyboard.press('Enter');
  await expect(counter(page)).toHaveText('2 de 4');
  await waitOpen(page);

  const box = await pswp(page).boundingBox();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(counter(page)).toHaveText('3 de 4');

  await page.keyboard.press('Escape');
  await expect(page.locator('.galeria-link').nth(1)).toBeFocused();
});

test('"Ver imagens ampliadas" abre o par antes/depois', async ({ page }) => {
  const problems = await gotoResults(page);
  const button = page.locator('[data-open-pair]');
  await expect(button).toHaveText(/Ver imagens ampliadas/);
  await button.click();
  await waitOpen(page);
  await expect(counter(page)).toHaveText('1 de 2');
  await expect(caption(page)).toContainText('Antes');
  await page.keyboard.press('ArrowRight');
  await expect(caption(page)).toContainText('Depois');
  await page.keyboard.press('Escape');
  await expect(pswp(page)).toHaveCount(0);
  await expect(button).toBeFocused();
  expect(problems).toEqual([]);
});

test.describe('prefers-reduced-motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('comparador e PhotoSwipe continuam funcionais, com foco e teclado', async ({ page }) => {
    const problems = watchConsole(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.locator('html')).not.toHaveClass(/has-smoother/);
    const slider = page.locator('[data-comparison-slider]');
    await slider.scrollIntoViewIfNeeded(); // rolagem nativa neste modo
    await expect(slider).toHaveClass(/rendered/);
    await slider.focus();
    await page.keyboard.press('End');
    await expect(slider).toHaveAttribute('aria-valuenow', '100');

    const thumb = page.locator('.galeria-link').nth(2);
    await thumb.focus();
    await page.keyboard.press('Enter');
    await waitOpen(page);
    await expect(counter(page)).toHaveText('3 de 4');
    await page.keyboard.press('Escape');
    await expect(pswp(page)).toHaveCount(0);
    await expect(thumb).toBeFocused();
    expect(problems).toEqual([]);
  });
});

test('aviso de placeholder visível enquanto não houver fotos reais', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.aviso-dev')).toContainText('imagens provisórias');
});

test.describe('celular com toque (390px)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });

  test('layout empilhado, galeria em duas colunas, toque arrasta o comparador e abre o lightbox', async ({ page }) => {
    const problems = watchConsole(page);
    await page.goto('/');
    await page.waitForTimeout(800);
    await scrollToElement(page, '#resultados', 0.02);

    const grid = await page.evaluate(() => {
      const rect = sel => document.querySelector(sel).getBoundingClientRect();
      const items = [...document.querySelectorAll('.galeria-item')].map(el => el.getBoundingClientRect());
      const cards = [...document.querySelectorAll('.servico')].map(el => el.getBoundingClientRect());
      return {
        sliderWidth: Math.round(rect('.comparador-slider').width),
        shellWidth: Math.round(rect('#resultados .shell').width),
        galleryColumns: new Set(items.map(r => Math.round(r.top))).size === 2 && Math.round(items[0].top) === Math.round(items[1].top),
        cardsOneColumn: new Set(cards.map(r => Math.round(r.left))).size === 1,
        contactStacked: new Set([...document.querySelectorAll('.contato-lista > div')].map(el => Math.round(el.getBoundingClientRect().left))).size === 1,
        overflow: document.documentElement.scrollWidth - innerWidth,
        smoother: document.documentElement.classList.contains('has-smoother'),
      };
    });
    expect(grid).toEqual({
      sliderWidth: grid.shellWidth - 2,
      shellWidth: grid.shellWidth,
      galleryColumns: true,
      cardsOneColumn: true,
      contactStacked: true,
      overflow: 0,
      smoother: false,
    });

    // Arraste por toque (eventos de toque reais via CDP)
    const slider = page.locator('[data-comparison-slider]');
    const box = await slider.boundingBox();
    const cdp = await page.context().newCDPSession(page);
    const y = box.y + box.height / 2;
    const point = x => [{ x, y, id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(box.x + box.width * 0.5) });
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(box.x + box.width * (0.5 + i * 0.04)) });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);
    expect(Number(await slider.getAttribute('aria-valuenow'))).toBeGreaterThan(70);

    // Controles de toque com tamanho confortável
    const handle = await page.locator('.comparador-alca').boundingBox();
    expect(handle.width).toBeGreaterThanOrEqual(44);
    const pairButton = await page.locator('[data-open-pair]').boundingBox();
    expect(pairButton.height).toBeGreaterThanOrEqual(44);

    await page.locator('.galeria-link').first().tap();
    await waitOpen(page);
    await expect(counter(page)).toHaveText('1 de 4');
    await page.locator('.pswp__button--close').tap();
    await expect(pswp(page)).toHaveCount(0);
    expect(problems).toEqual([]);
  });
});
