import { test, expect } from '@playwright/test';
import { SETTLE, watchConsole } from './helpers.js';

const headerHeight = page => page.locator('[data-topo]').evaluate(el => el.offsetHeight);
const topOf = (page, selector) => page.locator(selector).evaluate(el => el.getBoundingClientRect().top);

test.describe('desktop com ScrollSmoother', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('instância única; topo e lightbox fora do conteúdo transformado', async ({ page }) => {
    const problems = watchConsole(page);
    await page.goto('/');
    await expect(page.locator('html')).toHaveClass(/has-smoother/);
    await expect(page.locator('#smooth-wrapper')).toHaveCount(1);

    const outside = await page.evaluate(() => {
      const wrapper = document.getElementById('smooth-wrapper');
      return ['[data-topo]', '.skip-link'].every(sel => !wrapper.contains(document.querySelector(sel)));
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
    for (const id of ['servicos', 'como-funciona', 'sobre', 'contato']) {
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
    // O rodapé tem dois links para #inicio (a marca e o "Voltar ao início"): aponta para o botão.
    const back = await page.locator('.rodape-topo').boundingBox();
    await page.mouse.click(back.x + back.width / 2, back.y + back.height / 2);
    await page.waitForTimeout(SETTLE + 600);
    // "Voltar ao início" leva ao hero, não ao topo absoluto: acima dele fica a introdução
    // tipográfica, e refazer a entrada a cada clique seria hostil.
    expect(Math.abs((await topOf(page, '#inicio')) - (await headerHeight(page)))).toBeLessThanOrEqual(4);
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

test.describe('aparelho só de toque', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('rolagem nativa (sem ScrollSmoother) e âncoras abaixo do topo', async ({ page }) => {
    const problems = watchConsole(page);
    await page.goto('/');
    await page.waitForTimeout(800);
    await expect(page.locator('html')).not.toHaveClass(/has-smoother/);
    await page.locator('[data-menu-toggle]').tap();
    await page.locator('#menu a[href="#como-funciona"]').tap();
    await page.waitForTimeout(1500);
    const header = await headerHeight(page);
    expect(Math.abs((await topOf(page, '#como-funciona')) - header)).toBeLessThanOrEqual(4);
    expect(problems).toEqual([]);
  });
});
