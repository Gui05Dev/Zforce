// Gera public/assets/models/xiaomi-scooter/scene-otimizado.glb para o "Diagnóstico interativo".
//
//   npm run model:build
//
// Diferente do patinete técnico do hero, aqui os materiais e as texturas originais são preservados
// (a seção mostra o modelo com iluminação). O original (scene.gltf + scene.bin + textures/, ~9,4 MB)
// fica em assets-src/ e não é publicado: se este GLB falhar, o visualizador cai para a imagem
// ilustrativa, que é muito mais leve do que baixar o modelo original.
//
// O que faz: remove o símbolo do fabricante do deck, junta imagens/materiais idênticos, junta as
// malhas por material (menos draw calls), simplifica a geometria preservando a silhueta, quantiza
// os vértices e comprime com meshopt. As coordenadas de mundo são mantidas (Y para cima, frente em
// +Z, metros), então as posições dos hotspots valem tanto para o GLB quanto para o scene.gltf.
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { dedup, flatten, join, meshopt, prune, quantize, simplify, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { removeLogoTriangles, ROOT, SOURCE } from './model-shared.mjs';

const OUTPUT = resolve(ROOT, 'public/assets/models/xiaomi-scooter/scene-otimizado.glb');

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;

const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({
  'meshopt.encoder': MeshoptEncoder,
});
const doc = await io.read(SOURCE);
const root = doc.getRoot();

const count = () =>
  root
    .listMeshes()
    .flatMap(mesh => mesh.listPrimitives())
    .reduce((sum, prim) => sum + (prim.getIndices() ? prim.getIndices().getCount() : prim.getAttribute('POSITION').getCount()) / 3, 0);
const before = { triangulos: count(), materiais: root.listMaterials().length, imagens: root.listTextures().length };

let logo = 0;
for (const node of root.listNodes()) logo += removeLogoTriangles(node);

// UVs só são úteis em materiais com textura. Nos demais (cor sólida) eles criam costuras que impedem
// a fusão de vértices e travam a simplificação.
let uvsRemovidos = 0;
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const material = prim.getMaterial();
    if (material && !material.getBaseColorTexture() && prim.getAttribute('TEXCOORD_0')) {
      prim.setAttribute('TEXCOORD_0', null);
      uvsRemovidos++;
    }
  }
}

await doc.transform(
  dedup(),
  flatten(),
  join({ keepNamed: false }),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0.55, error: 0.0005 }),
  prune(),
  quantize(),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);

await io.write(OUTPUT, doc);

console.log({
  arquivo: OUTPUT.replace(ROOT, '.'),
  tamanhoKB: Math.round(statSync(OUTPUT).size / 1024),
  antes: before,
  depois: { triangulos: count(), materiais: root.listMaterials().length, imagens: root.listTextures().length },
  primitivas: root.listMeshes().reduce((n, m) => n + m.listPrimitives().length, 0),
  triangulosDoLogoRemovidos: logo,
  primitivasSemUV: uvsRemovidos,
});
