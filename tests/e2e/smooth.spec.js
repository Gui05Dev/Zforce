import { test, expect } from '@playwright/test';
import { SETTLE, scrollToElement, watchConsole } from './helpers.js';

const headerHeight = page => page.locator('[data-topo]').evaluate(el => el.offsetHeight);
const topOf = (page, selector) => page.locator(selector).evaluate(el => el.getBoundingClientRect().top);
const floatingState = page =>
  page.locator('[data-floating-whats]').evaluate(el => ({
    visible: Number(getComputedStyle(el).opacity) > 0.9 && getComputedStyle(el).visibility === 'visible',
    focusable: el.getAttribute('tabindex') !== '-1',
  }));

test.describe('desktop com ScrollSmoother', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('instância única; topo, WhatsApp e lightbox fora do conteúdo transformado', async ({ page }) => {
    const problems = watchConsole(page);
    await page.goto('/');
    await expect(page.locator('html')).toHaveClass(/has-smoother/);
    await expect(page.locator('#smooth-wrapper')).toHaveCount(1);

    const outside = await page.evaluate(() => {
      const wrapper = document.getElementById('smooth-wrapper');
      return ['[data-topo]', '[data-floating-whats]', '.skip-link'].every(sel => !wrapper.contains(document.querySelector(sel)));
    });
    expect(outside).toBe(true);

    await page.evaluate(() => window.scrollTo({ top: 1400, behavior: 'instant' }));
    await page.waitForTimeout(SETTLE);
    const transform = await page.locator('#smooth-content').evaluate(el => getComputedStyle(el).transform);
    expect(transform).not.toBe('none');
    expect(await topOf(page, '[data-topo]')).toBe(0);
    expect(await page.locator('.pin-spacer').count()).toBeLessThanOrEqual(1);
    expect(problems).toEqual([]);
  });

  test('âncoras do menu param logo abaixo do topo fixo e atualizam o endereço', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(800);
    const header = await headerHeight(page);
    for (const id of ['servicos', 'resultados', 'como-funciona', 'sobre', 'contato']) {
      await page.locator(`#menu a[href="#${id}"]`).click();
      await page.waitForTimeout(SETTLE + 300);
      const top = await topOf(page, `#${id}`);
      expect(Math.abs(top - header), `#${id} top=${top}`).toBeLessThanOrEqual(4);
      expect(page.url()).toContain(`#${id}`);
      await expect(page.locator(`#menu a[href="#${id}"]`)).toHaveAttribute('aria-current', 'true');
    }
    // "Voltar ao início" leva de volta ao topo. Rola como o usuário até o rodapé antes de clicar
    // (o auto-scroll do Playwright moveria o wrapper do ScrollSmoother, não a página).
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await page.waitForTimeout(SETTLE);
    const back = await page.locator('.rodape a[href="#inicio"]').boundingBox();
    await page.mouse.click(back.x + back.width / 2, back.y + back.height / 2);
    await page.waitForTimeout(SETTLE + 600);
    expect(await page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(2);
  });

  test('abrir com /#contato já posiciona a seção abaixo do topo', async ({ page }) => {
    await page.goto('/#contato');
    await page.waitForTimeout(2000);
    const header = await headerHeight(page);
    expect(Math.abs((await topOf(page, '#contato')) - header)).toBeLessThanOrEqual(4);
  });

  test('skip link leva o foco ao conteúdo', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page.locator('#conteudo')).toBeFocused();
  });
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`WhatsApp flutuante ${viewport.width}px: fora do hero, de Resultados, do diagnóstico e do CTA/rodapé`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.waitForTimeout(1500);
    expect(await floatingState(page)).toEqual({ visible: false, focusable: false });

    await scrollToElement(page, '.servicos', 0.1);
    expect(await floatingState(page)).toEqual({ visible: true, focusable: true });

    await scrollToElement(page, '.resultados-grade', 0.1);
    expect(await floatingState(page)).toEqual({ visible: false, focusable: false });

    await scrollToElement(page, '.diagnostico', 0.1);
    expect(await floatingState(page)).toEqual({ visible: false, focusable: false });

    await scrollToElement(page, '#sobre', 0.1);
    expect(await floatingState(page)).toEqual({ visible: true, focusable: true });

    // Afastado das bordas com margem mínima (medido visível, sem a escala da animação de saída).
    const box = await page.locator('[data-floating-whats]').boundingBox();
    expect(viewport.width - (box.x + box.width)).toBeGreaterThanOrEqual(16);
    expect(viewport.height - (box.y + box.height)).toBeGreaterThanOrEqual(16);

    // Perto do fim: não compete com "Voltar ao início" nem com o botão principal do CTA.
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await page.waitForTimeout(SETTLE);
    expect(await floatingState(page)).toEqual({ visible: false, focusable: false });
  });
}

test.describe('aparelho só de toque', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('rolagem nativa (sem ScrollSmoother) e âncoras abaixo do topo', async ({ page }) => {
    const problems = watchConsole(page);
    await page.goto('/');
    await page.waitForTimeout(800);
    await expect(page.locator('html')).not.toHaveClass(/has-smoother/);
    await page.locator('[data-menu-toggle]').tap();
    await page.locator('#menu a[href="#resultados"]').tap();
    await page.waitForTimeout(1500);
    const header = await headerHeight(page);
    expect(Math.abs((await topOf(page, '#resultados')) - header)).toBeLessThanOrEqual(4);
    expect(problems).toEqual([]);
  });
});
