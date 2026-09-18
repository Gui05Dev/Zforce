import { test, expect } from '@playwright/test';
import { watchConsole } from './helpers.js';

const percurso = page =>
  page.locator('[data-portal-espaco]').evaluate(el => parseFloat(getComputedStyle(el).height));
const progresso = (page, fracao) =>
  percurso(page).then(alt => page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), alt * fracao));
const opacidade = (page, seletor) =>
  page.locator(seletor).evaluate(el => Number(getComputedStyle(el).opacity));

test('abertura: a palavra é um recorte e a câmera atravessa a letra até revelar o hero', async ({ page }) => {
  const problemas = watchConsole(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForTimeout(2000);

  // No começo o palco cobre a tela e o hero está atrás dele, não visível "por baixo".
  await expect(page.locator('[data-portal]')).toBeVisible();
  await expect(page.locator('[data-portal]')).toHaveAttribute('data-portal-pronto', 'true');
  expect(await percurso(page)).toBeGreaterThan(900);

  // No meio a câmera já está dentro da letra: o recorte continua valendo e a escala cresceu.
  const clip = page.locator('#portal-recorte');
  const inicial = Number((await clip.getAttribute('transform')).match(/scale\(([^)]+)\)/)[1]);
  await progresso(page, 0.35);
  await page.waitForTimeout(900);
  const recorte = await page.locator('[data-portal-campo]').evaluate(el => getComputedStyle(el).clipPath);
  expect(recorte).toContain('portal-recorte');
  const dentro = await clip.getAttribute('transform');
  expect(Number(dentro.match(/scale\(([^)]+)\)/)[1])).toBeGreaterThan(inicial);
  // Nada de rotação, inclinação ou escala não uniforme.
  expect(dentro).not.toMatch(/rotate|skew|matrix/);

  // No fim o recorte foi solto, o palco saiu do caminho e o hero está inteiro.
  await progresso(page, 1);
  await page.waitForTimeout(1600);
  await expect(page.locator('[data-portal]')).toBeHidden();
  expect(await opacidade(page, '[data-hero-title]')).toBe(1);
  await expect(page.locator('.abertura-acoes .botao')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

  // E o hero para na mesma altura de sempre: a introdução não deixa salto de posição.
  const topo = await page.locator('[data-topo]').evaluate(el => el.offsetHeight);
  const heroTop = await page.locator('#inicio').evaluate(el => el.getBoundingClientRect().top);
  expect(Math.abs(heroTop - topo)).toBeLessThanOrEqual(4);

  // Voltar para cima devolve a introdução, sem travar em nenhum estado intermediário.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(1400);
  await expect(page.locator('[data-portal]')).toBeVisible();
  expect(problemas).toEqual([]);
});

test('o palco não engole cliques depois de terminar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForTimeout(1800);
  await progresso(page, 1);
  await page.waitForTimeout(1600);

  // Um palco invisível mas ainda no caminho tornaria o WhatsApp do hero inclicável.
  const alvo = page.locator('[data-hero] .botao').first();
  const caixa = await alvo.boundingBox();
  const noPonto = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.closest('a')?.getAttribute('href') ?? null,
    [caixa.x + caixa.width / 2, caixa.y + caixa.height / 2],
  );
  expect(noPonto).toContain('wa.me');
});

test('a abertura volta a cada acesso, mesmo recarregando depois de rolar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForTimeout(1800);
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await page.waitForTimeout(1200);

  // Sem scrollRestoration manual o navegador devolveria o visitante ao meio da página e a
  // abertura nunca aconteceria de novo.
  await page.reload();
  await page.waitForTimeout(2200);
  expect(await page.evaluate(() => Math.round(window.scrollY))).toBeLessThanOrEqual(2);
  await expect(page.locator('[data-portal]')).toBeVisible();
});

test('os links do menu continuam navegando durante e depois da abertura', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForTimeout(1800);
  await page.locator('#menu a', { hasText: 'Sobre' }).click();
  await page.waitForTimeout(2200);
  const topo = await page.locator('[data-topo]').evaluate(el => el.offsetHeight);
  const alvo = await page.locator('#sobre').evaluate(el => el.getBoundingClientRect().top);
  expect(Math.abs(alvo - topo)).toBeLessThanOrEqual(4);
  await expect(page.locator('[data-portal]')).toBeHidden();
});

test('redimensionar no meio da transição remede em vez de quebrar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForTimeout(1800);
  await progresso(page, 0.45);
  await page.waitForTimeout(800);

  await page.setViewportSize({ width: 900, height: 700 });
  await page.waitForTimeout(1600);
  await expect(page.locator('[data-portal-arte]')).toHaveAttribute('viewBox', '0 0 900 700');
  expect(await percurso(page)).toBe(Math.round(700 * 1.9));
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test.describe('prefers-reduced-motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('sem introdução: o hero é a primeira coisa da página', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForTimeout(600);
    await expect(page.locator('[data-portal]')).toBeHidden();
    expect(await percurso(page)).toBe(0);
    expect(await opacidade(page, '[data-hero-title]')).toBe(1);
  });
});

test.describe('JavaScript desativado', () => {
  test.use({ javaScriptEnabled: false });

  test('sem introdução, e o hero continua utilizável', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('[data-portal]')).toBeHidden();
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('[data-hero] .botao').first()).toBeVisible();
  });
});

test('o desenho técnico só dá lugar ao 3D depois de ser visto', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForTimeout(2000);
  const desenho = () =>
    page.locator('[data-hero-drawing]').evaluate(el => Number(getComputedStyle(el).opacity));

  // Demorar na abertura não pode consumir o tempo do desenho: ele nem começou ainda.
  await page.waitForTimeout(4000);
  expect(await desenho()).toBe(1);

  const alto = await percurso(page);
  await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), alto);
  await page.waitForTimeout(1200);
  // Sair antes da troca: ela fica guardada em vez de acontecer fora de vista.
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await page.waitForTimeout(4000);
  expect(await desenho()).toBe(1);

  // Ao voltar, a troca acontece — e o patinete 3D entra no lugar.
  await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), alto);
  await expect.poll(desenho, { timeout: 12_000 }).toBeLessThan(0.05);
  await expect(page.locator('[data-hero-canvas] canvas')).toHaveCount(1);
});

test('âncoras que apontam para o topo não pulam a abertura', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  // Clicar na marca do topo grava #inicio no endereço. Sem tratar isso, toda entrada seguinte
  // (recarregar, abrir o favorito, colar o link) cairia direto no hero.
  for (const hash of ['#inicio', '#conteudo']) {
    // about:blank entre um e outro: ir de /#inicio direto para /#conteudo é navegação no mesmo
    // documento, a página não recarrega e o script inline não roda — o que não é o caso real de
    // alguém abrindo o endereço.
    await page.goto('about:blank');
    await page.goto(`/${hash}`);
    await page.waitForTimeout(2200);
    expect(await page.evaluate(() => Math.round(window.scrollY)), hash).toBeLessThanOrEqual(2);
    await expect(page.locator('[data-portal]'), hash).toBeVisible();
  }

  // Durante a sessão, porém, a marca continua levando ao hero: refazer a abertura a cada
  // clique no logo seria hostil.
  await page.goto('/');
  await page.waitForTimeout(1800);
  await page.evaluate(() => window.scrollTo({ top: 3000, behavior: 'instant' }));
  await page.waitForTimeout(800);
  await page.locator('.topo .marca').click();
  await page.waitForTimeout(2200);
  const topo = await page.locator('[data-topo]').evaluate(el => el.offsetHeight);
  const hero = await page.locator('#inicio').evaluate(el => el.getBoundingClientRect().top);
  expect(Math.abs(hero - topo)).toBeLessThanOrEqual(4);
  await expect(page.locator('[data-portal]')).toBeHidden();
});
