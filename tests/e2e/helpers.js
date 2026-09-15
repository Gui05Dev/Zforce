// Utilitários compartilhados pelos testes end-to-end.

export const ANIMATED =
  '.js-hero, [data-reveal], .servico, [data-reveal-block], [data-stat], [data-cta-item]';

export function watchConsole(page) {
  const problems = [];
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') problems.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', error => problems.push(`pageerror: ${error.message}`));
  return problems;
}

/** Tempo para a rolagem suave (ScrollSmoother, smooth 0.7) assentar. */
export const SETTLE = 1300;

/** Rola como um usuário (rolagem da janela), passando pela página inteira. */
export async function scrollThrough(page, direction = 'down') {
  await page.evaluate(async dir => {
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const step = window.innerHeight * 0.5;
    const positions = [];
    for (let y = 0; y <= max + step; y += step) positions.push(Math.min(y, max));
    if (dir === 'up') positions.reverse();
    for (const y of positions) {
      window.scrollTo({ top: y, behavior: 'instant' });
      await wait(110);
    }
    await wait(1600);
  }, direction);
}

/**
 * Leva o elemento para `offset` (fração da altura) a partir do topo da janela.
 * Não usa scrollIntoView: com ScrollSmoother ele moveria o wrapper, e não a rolagem real.
 */
export async function scrollToElement(page, selector, offset = 0.25) {
  await page.evaluate(
    ({ selector: sel, offset: frac }) => {
      const el = document.querySelector(sel);
      const top = el.getBoundingClientRect().top + window.scrollY - window.innerHeight * frac;
      window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
    },
    { selector, offset },
  );
  await page.waitForTimeout(SETTLE);
}

export async function hiddenElements(page) {
  return page.$$eval(ANIMATED, els =>
    els
      .filter(el => {
        const style = getComputedStyle(el);
        return style.visibility !== 'visible' || Number(style.opacity) < 0.99;
      })
      .map(el => el.className || el.tagName),
  );
}

/** Razão de contraste WCAG entre a cor do texto e um fundo sólido. */
export async function contrastRatio(page, selector, background = '#111113') {
  return page.locator(selector).first().evaluate((el, bg) => {
    const parse = value => {
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    const luminance = rgb =>
      rgb
        .map(c => c / 255)
        .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
        .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
    const a = luminance(parse(getComputedStyle(el).color));
    const b = luminance(parse(bg));
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }, background);
}
