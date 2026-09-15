import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const MODEL = new URL('../../assets/models/patinete-zforce.glb', import.meta.url);

/** Lê o bloco JSON de um arquivo GLB (cabeçalho de 12 bytes + chunk JSON). */
function readGlbJson(url) {
  const buf = readFileSync(url);
  assert.equal(buf.toString('ascii', 0, 4), 'glTF', 'assinatura GLB');
  const jsonLength = buf.readUInt32LE(12);
  assert.equal(buf.toString('ascii', 16, 20), 'JSON');
  return JSON.parse(buf.toString('utf8', 20, 20 + jsonLength));
}

test('modelo 3D otimizado: leve o bastante para o hero', () => {
  const kb = statSync(MODEL).size / 1024;
  assert.ok(kb < 800, `patinete-zforce.glb com ${Math.round(kb)} KB (limite 800 KB)`);
});

test('modelo 3D sem texturas nem imagens (inclusive a marca do fabricante)', () => {
  const gltf = readGlbJson(MODEL);
  assert.equal((gltf.images || []).length, 0);
  assert.equal((gltf.textures || []).length, 0);
});

test('modelo 3D comprimido com meshopt e com superfície + arestas', () => {
  const gltf = readGlbJson(MODEL);
  assert.ok(gltf.extensionsUsed.includes('EXT_meshopt_compression'));
  const modes = gltf.meshes.flatMap(m => m.primitives.map(p => p.mode ?? 4));
  assert.ok(modes.includes(4), 'triângulos (superfície)');
  assert.ok(modes.includes(1), 'linhas (arestas pré-calculadas)');
  assert.deepEqual(gltf.materials.map(m => m.name).sort(), ['corpo', 'destaque']);
});

test('crédito da licença gravado no modelo do hero', () => {
  const gltf = readGlbJson(MODEL);
  assert.match(gltf.scenes[gltf.scene ?? 0].extras.fonte, /tonielpro520.*CC-BY-4\.0/);
});

const DIAGNOSTIC_MODEL = new URL('../../public/assets/models/xiaomi-scooter/scene-otimizado.glb', import.meta.url);

test('modelo do diagnóstico otimizado: texturas preservadas, meshopt e bem menor que o original', () => {
  const kb = statSync(DIAGNOSTIC_MODEL).size / 1024;
  assert.ok(kb < 1200, `scene-otimizado.glb com ${Math.round(kb)} KB (limite 1200 KB)`);
  const gltf = readGlbJson(DIAGNOSTIC_MODEL);
  assert.ok(gltf.extensionsUsed.includes('EXT_meshopt_compression'));
  assert.ok((gltf.images || []).length >= 1, 'texturas mantidas');
  const original = statSync(new URL('../../public/assets/models/xiaomi-scooter/scene.bin', import.meta.url)).size / 1024;
  assert.ok(kb < original / 5, 'ao menos 5× menor que o scene.bin original');
});
