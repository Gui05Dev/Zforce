// Diagnóstico interativo no Chrome headless. Conforme a máquina, o headless tem ou não WebGL acelerado,
// então estes testes valem para os dois modos (3D ou imagem): interações, WhatsApp, acessibilidade e layout.
// Modo imagem forçado: tests/e2e/no-webgl.spec.js. Detalhes do 3D (rotação, GPU): tests/gpu/diagnostic.spec.js.
import { test, expect } from '@playwright/test';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { scrollToElement, watchConsole } from './helpers.js';

/** Tamanho total de uma pasta, em MB. */
function pastaMB(dir) {
  const bytes = readdirSync(dir, { withFileTypes: true }).reduce((total, entry) => {
    const caminho = join(dir, entry.name);
    return total + (entry.isDirectory() ? pastaMB(caminho) * 1024 * 1024 : statSync(caminho).size);
  }, 0);
  return bytes / 1024 / 1024;
}

const stage = page => page.locator('[data-diagnostic-stage]');
const card = (page, id) => page.locator(`[data-card-component="${id}"]`);

async function gotoDiagnostic(page, viewport = { width: 1440, height: 900 }) {
  const problems = watchConsole(page);
  await page.setViewportSize(viewport);
  await page.goto('/');
  await page.waitForTimeout(700);
  // Topo do diagnóstico logo abaixo do cabeçalho: palco e card inteiros na tela.
  await scrollToElement(page, '.diagnostico', 0.1);
  await expect(stage(page)).toHaveClass(/is-3d|is-image/, { timeout: 20_000 });
  return problems;
}

/** No modo 3D, um toque rápido no canvas encerra a autorrotação (os pontos param de se mover). */
async function holdModel(page) {
  if (!(await stage(page).evaluate(el => el.classList.contains('is-3d')))) return;
  const box = await stage(page).boundingBox();
  await page.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.3);
  await page.waitForTimeout(1600);
}

async function hotspotsInsideStage(page) {
  const box = await stage(page).boundingBox();
  const out = [];
  for (const button of await page.locator('.diagnostico-ponto-botao').all()) {
    const b = await button.boundingBox();
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    if (cx < box.x || cx > box.x + box.width || cy < box.y || cy > box.y + box.height) out.push(await button.getAttribute('aria-label'));
  }
  return out;
}

test('publica o GLB otimizado, a licença e a imagem — e não o modelo original', async ({ page, request }) => {
  const base = 'assets/models/xiaomi-scooter/';
  await page.goto('/');
  const paths = [base + 'scene-otimizado.glb', base + 'license.txt', await page.locator('[data-diagnostic-poster]').getAttribute('src')];
  for (const path of paths) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
  }

  // O original (~9,4 MB) vive em assets-src/ e não pode voltar para o site publicado.
  // O `vite preview` responde rota desconhecida com o index.html (200); o GitHub Pages responde 404.
  // Nos dois casos o que importa é que o corpo não seja o modelo.
  for (const path of ['scene.gltf', 'scene.bin', 'textures/Carro_Vermelho_baseColor.png']) {
    const response = await request.get(base + path);
    if (response.status() !== 200) continue;
    expect((await response.text()).slice(0, 15).toLowerCase(), base + path).toContain('<!doctype');
  }
});

test('o build publicado não carrega o modelo original (regressão dos 12 MB de dist/)', () => {
  const models = resolve(process.cwd(), 'dist/assets/models/xiaomi-scooter');
  expect(readdirSync(models).sort()).toEqual(['license.txt', 'scene-otimizado.glb']);

  const tamanhoMB = pastaMB(resolve(process.cwd(), 'dist'));
  expect(tamanhoMB, `dist/ com ${tamanhoMB.toFixed(1)} MB`).toBeLessThan(5);
});

test('carregamento direto em /#como-funciona e atualização da página', async ({ page }) => {
  const problems = watchConsole(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const load of [() => page.goto('/#como-funciona'), () => page.reload()]) {
    await load();
    await expect(stage(page)).toHaveClass(/is-3d|is-image/, { timeout: 20_000 });
    const header = await page.locator('[data-topo]').evaluate(el => el.offsetHeight);
    await expect.poll(() => page.locator('#como-funciona').evaluate(el => Math.round(el.getBoundingClientRect().top)), { timeout: 5000 }).toBeLessThanOrEqual(header + 4);
    await expect(page.locator('.diagnostico-componente[aria-pressed="true"]')).toHaveCount(1);
    await expect(page.locator('[data-diagnostic-canvas] canvas')).toHaveCount((await stage(page).evaluate(el => el.classList.contains('is-3d'))) ? 1 : 0);
  }
  expect(problems).toEqual([]);
});

test('selecionar pelo ponto atualiza estado, card e botão do WhatsApp com componente e sintoma', async ({ page }) => {
  const problems = await gotoDiagnostic(page);
  // Estado inicial: primeiro componente
  await expect(page.locator('.diagnostico-componente[data-select="energia"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(card(page, 'energia')).toBeVisible();

  await holdModel(page);
  await page.locator('[data-hotspot="rodas"] button').click();
  const rodas = card(page, 'rodas');
  await expect(page.locator('[data-hotspot="rodas"] button')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.diagnostico-componente[data-select="rodas"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-hotspot="energia"] button')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-hotspot="rodas"]')).toHaveClass(/is-active/);
  await expect(rodas).toBeVisible();
  await expect(rodas.locator('h3')).toHaveText('Pneus e freios');
  await expect(card(page, 'energia')).toBeHidden();
  await expect(rodas.locator('[data-symptom]')).toHaveText(['Pneu furado.', 'Freio fraco.', 'Barulho durante a frenagem.', 'Roda desalinhada ou com folga.']);

  const cta = rodas.locator('[data-diagnostic-cta]');
  await expect(cta).toHaveText(/Estou com este problema/);
  await rodas.locator('[data-symptom="Freio fraco."]').click();
  await expect(rodas.locator('[data-symptom="Freio fraco."]')).toHaveAttribute('aria-pressed', 'true');
  const href = await cta.getAttribute('href');
  expect(href.startsWith('https://wa.me/5545988037791?text=')).toBe(true);
  expect(decodeURIComponent(href.split('text=')[1])).toBe(
    'Olá! Vi o diagnóstico interativo no site da Z-Force.\nMeu patinete apresenta um possível problema em Pneus e freios:\nFreio fraco.\nGostaria de solicitar uma avaliação.',
  );
  await expect(cta).toHaveAttribute('target', '_blank');

  // Clicar de novo no sintoma desmarca e a mensagem volta à genérica.
  await rodas.locator('[data-symptom="Freio fraco."]').click();
  expect(decodeURIComponent((await cta.getAttribute('href')).split('text=')[1])).toContain('ainda não sei qual é o sintoma exato');

  // O clique no botão abre o WhatsApp numa nova aba com a mensagem.
  const [popup] = await Promise.all([page.waitForEvent('popup'), cta.click()]);
  expect(popup.url()).toMatch(/wa\.me|whatsapp\.com/);
  await popup.close();
  expect(problems.filter(p => !/wa\.me|whatsapp/i.test(p))).toEqual([]);
});

test('teclado: lista de componentes e sintomas com Tab/Enter/Espaço e foco visível', async ({ page }) => {
  await gotoDiagnostic(page);
  const painel = page.locator('.diagnostico-componente[data-select="painel"]');
  await painel.focus();
  await page.keyboard.press('Enter');
  await expect(painel).toHaveAttribute('aria-pressed', 'true');
  await expect(card(page, 'painel')).toBeVisible();
  expect(await painel.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');

  await holdModel(page);
  await page.locator('[data-hotspot="estrutura"] button').focus();
  await page.keyboard.press('Space');
  await expect(card(page, 'estrutura')).toBeVisible();
  // Card oculto não recebe foco (inert); o visível sim.
  await expect(card(page, 'painel')).toHaveAttribute('inert', '');
  const first = card(page, 'estrutura').locator('[data-symptom]').first();
  await first.focus();
  await page.keyboard.press('Space');
  await expect(first).toHaveAttribute('aria-pressed', 'true');
});

test('selecionado não depende só da cor: nome visível ao lado do ponto', async ({ page }) => {
  await gotoDiagnostic(page);
  // Pela lista: no modo 3D a autorrotação move os pontos; aqui interessa o estado visual do ponto.
  await page.locator('.diagnostico-componente[data-select="motor"]').click();
  await page.waitForTimeout(1100);
  const name = page.locator('[data-hotspot="motor"] .diagnostico-ponto-nome');
  await expect.poll(() => name.evaluate(el => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0.9);
  const other = page.locator('[data-hotspot="painel"] .diagnostico-ponto-nome');
  expect(await other.evaluate(el => Number(getComputedStyle(el).opacity))).toBeLessThan(0.1);
});

test('etapas: lista vertical, ordem correta e linha de progresso', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  // Lista vertical em qualquer largura: mesma coluna (left igual), topo crescente.
  const boxes = await page.locator('.passo').evaluateAll(els => els.map(el => el.getBoundingClientRect()));
  expect(new Set(boxes.map(b => Math.round(b.left))).size).toBe(1);
  expect(boxes.map(b => Math.round(b.top))).toEqual([...boxes.map(b => Math.round(b.top))].sort((a, b) => a - b));
  await expect(page.locator('.passo h3')).toHaveText(['Primeiro, a conversa', 'Depois, a avaliação', 'Orçamento antes do serviço', 'Pronto para rodar']);
});

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 768, height: 1024 },
]) {
  test(`layout ${viewport.width}×${viewport.height}: palco e painel sem cortes nem rolagem horizontal`, async ({ page }) => {
    const problems = await gotoDiagnostic(page, viewport);
    const s = await stage(page).boundingBox();
    const info = await page.locator('.diagnostico-info').boundingBox();
    if (viewport.width >= 1000) {
      // ~60/40 lado a lado
      expect(Math.abs(s.y - info.y)).toBeLessThan(4);
      const ratio = s.width / (s.width + info.width);
      expect(ratio).toBeGreaterThan(0.55);
      expect(ratio).toBeLessThan(0.65);
      expect(s.height).toBeLessThanOrEqual(viewport.height);
    } else {
      expect(info.y).toBeGreaterThan(s.y + s.height - 1);
      expect(s.height).toBeLessThanOrEqual(viewport.height * 0.6 + 1);
    }
    expect(await hotspotsInsideStage(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    await page.locator('.diagnostico').screenshot({ path: `test-results/shots/diagnostico-${viewport.width}.png` });
    expect(problems).toEqual([]);
  });
}

test.describe('celular 390×844 com toque', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('palco entre 45 e 60vh, lista abaixo, toques ≥ 44 px, etapas verticais e pontos na tela', async ({ page }) => {
    const problems = watchConsole(page);
    await page.goto('/');
    await page.waitForTimeout(700);
    await scrollToElement(page, '.diagnostico', 0.1);
    await expect(stage(page)).toHaveClass(/is-3d|is-image/, { timeout: 20_000 });
    const s = await stage(page).boundingBox();
    expect(s.height).toBeGreaterThanOrEqual(844 * 0.45 - 1);
    expect(s.height).toBeLessThanOrEqual(844 * 0.6 + 1);
    const list = await page.locator('.diagnostico-componentes').boundingBox();
    expect(list.y).toBeGreaterThan(s.y + s.height);
    for (const selector of ['.diagnostico-ponto-botao', '.diagnostico-componente', '.diagnostico-sintoma', '.diagnostico-cta']) {
      for (const el of await page.locator(selector).all()) {
        if (!(await el.isVisible())) continue;
        const b = await el.boundingBox();
        expect(Math.round(Math.min(b.width, b.height)), selector).toBeGreaterThanOrEqual(44);
      }
    }
    expect(await hotspotsInsideStage(page)).toEqual([]);
    await page.locator('[data-hotspot="painel"] button').tap();
    await expect(card(page, 'painel')).toBeVisible();
    const lefts = await page.locator('.passo').evaluateAll(els => els.map(el => Math.round(el.getBoundingClientRect().left)));
    expect(new Set(lefts).size).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    await page.locator('.diagnostico').screenshot({ path: 'test-results/shots/diagnostico-390.png' });
    expect(problems).toEqual([]);
  });
});

test.describe('prefers-reduced-motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('conteúdo e interações disponíveis, sem animações contínuas nos pontos', async ({ page }) => {
    await gotoDiagnostic(page);
    await page.locator('.diagnostico-componente[data-select="motor"]').click();
    await expect(card(page, 'motor')).toBeVisible();
    const pulse = await page.locator('[data-hotspot="motor"] .diagnostico-ponto-numero').evaluate(el => getComputedStyle(el, '::after').animationName);
    expect(pulse).toBe('none');
  });
});

test.describe('JavaScript desativado', () => {
  test.use({ javaScriptEnabled: false });

  test('todos os componentes, sintomas, links e etapas ficam legíveis', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.diagnostico-card')).toHaveCount(5);
    for (const c of await page.locator('.diagnostico-card').all()) await expect(c).toBeVisible();
    await expect(page.locator('.diagnostico-cta').first()).toHaveAttribute('href', /wa\.me\/5545988037791\?text=/);
    await expect(page.locator('.diagnostico-pontos')).toBeHidden();
    await expect(page.locator('.passo')).toHaveCount(4);
  });
});
