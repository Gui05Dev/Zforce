import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { galleryItems, listResultFiles, MAX_GALLERY_ITEMS, renderResults, repairProjects } from '../../js/data/results.js';

const publicPath = file => new URL(`../../public/${file}`, import.meta.url);

/** Lê largura/altura de um WebP (VP8, VP8L ou VP8X) sem dependências. */
function webpSize(file) {
  const buf = readFileSync(publicPath(file));
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  if (chunk === 'VP8L') {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
}

test('todas as imagens declaradas existem em public/', () => {
  for (const file of listResultFiles()) assert.ok(existsSync(publicPath(file)), `faltando: ${file}`);
});

test('dimensões declaradas batem com os arquivos (evita layout shift e zoom errado no PhotoSwipe)', () => {
  for (const project of repairProjects) {
    for (const side of [project.before, project.after]) {
      assert.deepEqual(webpSize(side.large), { width: side.width, height: side.height }, side.large);
    }
  }
  for (const item of galleryItems) {
    assert.deepEqual(webpSize(item.thumb.src), { width: item.thumb.width, height: item.thumb.height }, item.thumb.src);
    assert.deepEqual(webpSize(item.large.src), { width: item.large.width, height: item.large.height }, item.large.src);
  }
});

test('miniaturas são arquivos diferentes (e menores) que as imagens grandes', () => {
  for (const item of galleryItems) {
    assert.notEqual(item.thumb.src, item.large.src);
    assert.ok(item.thumb.width < item.large.width);
  }
});

test('HTML gerado: comparador, no máximo quatro miniaturas, textos alternativos e escape', () => {
  const html = renderResults();
  assert.match(html, /<img-comparison-slider/);
  assert.equal((html.match(/data-gallery-index=/g) || []).length, Math.min(galleryItems.length, MAX_GALLERY_ITEMS));
  assert.doesNotMatch(html, /alt=""/);

  const hostile = renderResults({
    projects: [{ ...repairProjects[0], title: '<script>x</script>"' }],
    gallery: galleryItems,
  });
  assert.doesNotMatch(hostile, /<script>x/);
  assert.match(hostile, /&lt;script&gt;x&lt;\/script&gt;&quot;/);
});

test('placeholders sinalizados enquanto não houver fotos reais', () => {
  const allPlaceholders = [...repairProjects, ...galleryItems].every(item => item.placeholder === true);
  if (allPlaceholders) assert.match(renderResults(), /class="aviso-dev"/);
});
