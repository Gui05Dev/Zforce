// Diagnóstico interativo com GPU real (janela visível):  npm run test:gpu
import { test, expect } from '@playwright/test';

const SETTLE = 1300;

function watchConsole(page) {
  const problems = [];
  page.on('console', msg => ['error', 'warning'].includes(msg.type()) && problems.push(msg.text()));
  page.on('pageerror', error => problems.push(error.message));
  return problems;
}

/** Conta draw calls feitos no canvas do diagnóstico (instrumenta o WebGL antes da página carregar). */
async function instrumentDraws(page) {
  await page.addInitScript(() => {
    window.__drawsDiagnostico = 0;
    for (const Ctx of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
      if (!Ctx) continue;
      for (const fn of ['drawArrays', 'drawElements']) {
        const original = Ctx.prototype[fn];
        Ctx.prototype[fn] = function (...args) {
          if (this.canvas.closest?.('[data-diagnostic-canvas]')) window.__drawsDiagnostico++;
          return original.apply(this, args);
        };
      }
    }
  });
}
const draws = page => page.evaluate(() => window.__drawsDiagnostico);

async function scrollToDiagnostic(page) {
  await page.evaluate(() => {
    const el = document.querySelector('.diagnostico');
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 90, behavior: 'instant' });
  });
  await page.waitForTimeout(SETTLE);
}
const hotspotTransform = (page, id) => page.locator(`[data-hotspot="${id}"]`).evaluate(el => el.style.transform);

test('carrega o GLB otimizado só perto da seção, mostra o 3D e posiciona os pontos', async ({ page }) => {
  const problems = watchConsole(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const modelRequests = [];
  page.on('response', r => /xiaomi-scooter\/scene/.test(r.url()) && modelRequests.push(`${r.status()} ${r.url().split('/').pop()}`));
  await page.goto('/');
  await page.waitForTimeout(2500);
  expect(modelRequests, 'não baixa o modelo no topo da página').toEqual([]);

  await scrollToDiagnostic(page);
  const stage = page.locator('[data-diagnostic-stage]');
  await expect(stage).toHaveClass(/is-3d/, { timeout: 20_000 });
  expect(modelRequests).toEqual(['200 scene-otimizado.glb']);
  await expect(page.locator('[data-diagnostic-canvas] canvas')).toHaveCount(1);
  await expect(page.locator('[data-diagnostic-status]')).toBeHidden();
  await expect(page.locator('[data-diagnostic-hint]')).toContainText('Arraste para girar');

  const box = await stage.boundingBox();
  for (const button of await page.locator('.diagnostico-ponto-botao').all()) {
    const b = await button.boundingBox();
    expect(b.x + b.width / 2).toBeGreaterThanOrEqual(box.x);
    expect(b.x + b.width / 2).toBeLessThanOrEqual(box.x + box.width);
    expect(b.y + b.height / 2).toBeGreaterThanOrEqual(box.y);
    expect(b.y + b.height / 2).toBeLessThanOrEqual(box.y + box.height);
  }
  // DPR limitado a 1,5
  const dpr = await page.locator('[data-diagnostic-canvas] canvas').evaluate(c => c.width / c.clientWidth);
  expect(dpr).toBeLessThanOrEqual(1.5);
  await page.locator('.diagnostico').screenshot({ path: 'test-results/shots/diagnostico-3d-1440.png' });
  expect(problems).toEqual([]);
});

test('autorrotação lenta até a primeira interação; arrastar gira e para a autorrotação de vez', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await scrollToDiagnostic(page);
  await expect(page.locator('[data-diagnostic-stage]')).toHaveClass(/is-3d/, { timeout: 20_000 });

  const a = await hotspotTransform(page, 'painel');
  await page.waitForTimeout(1200);
  expect(await hotspotTransform(page, 'painel'), 'autorrotação ativa').not.toBe(a);

  const canvas = await page.locator('[data-diagnostic-canvas] canvas').boundingBox();
  const y = canvas.y + canvas.height / 2;
  await page.mouse.move(canvas.x + canvas.width * 0.35, y);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * 0.7, y, { steps: 15 });
  await page.mouse.up();
  await expect(page.locator('[data-diagnostic-hint]')).toHaveClass(/is-hidden/);

  await page.waitForTimeout(2000); // inércia termina
  const b = await hotspotTransform(page, 'painel');
  await page.waitForTimeout(2500);
  expect(await hotspotTransform(page, 'painel'), 'não volta a girar sozinho').toBe(b);
});

test('roda do mouse sobre o modelo rola a página (sem zoom) e o patinete nunca vira', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await scrollToDiagnostic(page);
  await expect(page.locator('[data-diagnostic-stage]')).toHaveClass(/is-3d/, { timeout: 20_000 });
  const canvas = await page.locator('[data-diagnostic-canvas] canvas').boundingBox();
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  const before = await page.evaluate(() => window.scrollY);
  const size = await page.locator('[data-diagnostic-canvas] canvas').evaluate(c => c.width);
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(SETTLE);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(before + 300);
  expect(await page.locator('[data-diagnostic-canvas] canvas').evaluate(c => c.width)).toBe(size);

  // Arraste vertical forte: o painel (guidão) continua acima das rodas (sem virar de cabeça para baixo).
  await scrollToDiagnostic(page);
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height * 0.95, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(1500);
  const painel = await page.locator('[data-hotspot="painel"] button').boundingBox();
  const motor = await page.locator('[data-hotspot="motor"] button').boundingBox();
  expect(painel.y).toBeLessThan(motor.y);
});

test('selecionar um componente gira até ele, atualiza o card e o WhatsApp', async ({ page }) => {
  const problems = watchConsole(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');
  await scrollToDiagnostic(page);
  await expect(page.locator('[data-diagnostic-stage]')).toHaveClass(/is-3d/, { timeout: 20_000 });
  const before = await hotspotTransform(page, 'rodas');
  await page.locator('.diagnostico-componente[data-select="rodas"]').click();
  await page.waitForTimeout(1300);
  expect(await hotspotTransform(page, 'rodas')).not.toBe(before);
  await expect(page.locator('[data-hotspot="rodas"]')).toHaveClass(/is-active/);
  const cardRodas = page.locator('[data-card-component="rodas"]');
  await expect(cardRodas).toBeVisible();
  await cardRodas.locator('[data-symptom="Pneu furado."]').click();
  expect(decodeURIComponent((await cardRodas.locator('[data-diagnostic-cta]').getAttribute('href')).split('text=')[1])).toContain(
    'Pneus e freios:\nPneu furado.',
  );
  // O ponto 3D também seleciona.
  await page.locator('[data-hotspot="painel"] button').click();
  await expect(page.locator('[data-card-component="painel"]')).toBeVisible();
  expect(problems).toEqual([]);
});

test('sem desenhar quando parado, fora da tela ou com a aba oculta', async ({ page }) => {
  await instrumentDraws(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await scrollToDiagnostic(page);
  await expect(page.locator('[data-diagnostic-stage]')).toHaveClass(/is-3d/, { timeout: 20_000 });

  // Autorrotação desenha continuamente.
  let d = await draws(page);
  await page.waitForTimeout(1000);
  expect((await draws(page)) - d).toBeGreaterThan(20);

  // Parado após interação: nenhum draw call.
  const canvas = await page.locator('[data-diagnostic-canvas] canvas').boundingBox();
  await page.mouse.move(canvas.x + 300, canvas.y + 300);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 360, canvas.y + 300, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(2000);
  d = await draws(page);
  await page.waitForTimeout(1500);
  expect((await draws(page)) - d, 'parado').toBe(0);

  // Reativa a animação e sai da seção: loop pausado.
  await page.locator('.diagnostico-componente[data-select="motor"]').click();
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await page.waitForTimeout(1500);
  d = await draws(page);
  await page.waitForTimeout(1500);
  expect((await draws(page)) - d, 'fora da tela').toBe(0);

  // Aba oculta (simulada) e volta à aba.
  await scrollToDiagnostic(page);
  await page.evaluate(() => {
    window.__abaOculta = true;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__abaOculta });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  d = await draws(page);
  await page.locator('.diagnostico-componente[data-select="painel"]').click();
  await page.waitForTimeout(1200);
  expect((await draws(page)) - d, 'aba oculta').toBe(0);

  await page.evaluate(() => {
    window.__abaOculta = false;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  d = await draws(page);
  await page.locator('.diagnostico-componente[data-select="rodas"]').click();
  await page.waitForTimeout(1200);
  expect((await draws(page)) - d, 'ao voltar à aba, o loop retoma').toBeGreaterThan(0);
});

test('movimento reduzido: 3D sem autorrotação', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto('/');
  await page.evaluate(() => document.querySelector('.diagnostico').scrollIntoView({ block: 'start' }));
  await expect(page.locator('[data-diagnostic-stage]')).toHaveClass(/is-3d/, { timeout: 20_000 });
  await page.waitForTimeout(800);
  const a = await hotspotTransform(page, 'painel');
  await page.waitForTimeout(1500);
  expect(await hotspotTransform(page, 'painel')).toBe(a);
  await context.close();
});

test('economia de dados: usa a imagem e não baixa o modelo', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await scrollToDiagnostic(page);
  await expect(page.locator('[data-diagnostic-stage]')).toHaveClass(/is-image/);
  await expect(page.locator('[data-diagnostic-status]')).toContainText('Economia de dados');
  expect(await page.evaluate(() => performance.getEntriesByType('resource').some(e => /xiaomi-scooter\/scene/.test(e.name)))).toBe(false);
});

test('erro ao carregar: cai para a imagem ilustrativa com aviso', async ({ page }) => {
  await page.route(/xiaomi-scooter\/scene/, route => route.abort());
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await scrollToDiagnostic(page);
  await expect(page.locator('[data-diagnostic-stage]')).toHaveClass(/is-image/, { timeout: 20_000 });
  await expect(page.locator('[data-diagnostic-status]')).toContainText('Não foi possível carregar o modelo 3D');
  await expect(page.locator('[data-diagnostic-poster]')).toBeVisible();
});

test.describe('celular com toque', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });

  test('arraste vertical rola a página; horizontal gira; DPR ≤ 1,5', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => document.querySelector('.diagnostico').scrollIntoView({ block: 'start' }));
    await expect(page.locator('[data-diagnostic-stage]')).toHaveClass(/is-3d/, { timeout: 20_000 });
    const canvas = page.locator('[data-diagnostic-canvas] canvas');
    await expect(canvas).toHaveCSS('touch-action', 'pan-y');
    expect(await canvas.evaluate(c => c.width / c.clientWidth)).toBeLessThanOrEqual(1.5);

    const box = await canvas.boundingBox();
    const cdp = await page.context().newCDPSession(page);
    const touch = async (type, x, y) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });

    // Horizontal: gira. Mede as rodas (longe do eixo de rotação; o painel fica quase sobre ele).
    // Posição x aplicada pelo Three.js no transform de cada ponto.
    const wheels = () =>
      page.evaluate(() =>
        ['motor', 'rodas'].map(id => parseFloat(document.querySelector(`[data-hotspot="${id}"]`).style.transform.match(/translate3d\(([-\d.]+)px/)[1])),
      );
    const before = await wheels();
    await touch('touchStart', box.x + box.width * 0.3, box.y + box.height / 2);
    // Movimentos espaçados como um dedo real (no mesmo quadro o Chrome agrupa os eventos).
    for (let i = 1; i <= 10; i++) {
      await touch('touchMove', box.x + box.width * (0.3 + i * 0.04), box.y + box.height / 2);
      await page.waitForTimeout(16);
    }
    await touch('touchEnd');
    await page.waitForTimeout(800);
    const after = await wheels();
    expect(Math.max(...after.map((x, i) => Math.abs(x - before[i])))).toBeGreaterThan(20);

    // Vertical: a página rola
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await touch('touchStart', box.x + box.width / 2, box.y + box.height * 0.8);
    for (let i = 1; i <= 10; i++) await touch('touchMove', box.x + box.width / 2, box.y + box.height * (0.8 - i * 0.06));
    await touch('touchEnd');
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(scrollBefore + 40);
    await page.screenshot({ path: 'test-results/shots/diagnostico-3d-390.png' });
  });
});
