// Gera assets/models/patinete-zforce.glb (patinete técnico do hero) a partir do modelo original
// em assets-src/models/xiaomi-scooter/ (Sketchfab, CC-BY-4.0), sem alterar o original.
//
//   npm run model:build
//
// O que faz:
// 1. Descarta texturas e UVs (o acabamento "técnico" é feito por materiais no Three.js) e remove
//    o símbolo do fabricante da placa na frente do deck.
// 2. Classifica as peças em "corpo" e "destaque" (cabos, luzes, refletores, painel).
// 3. Pré-calcula as arestas de contorno (linhas) a partir da malha original, com limiar de ângulo
//    por peça: pneus e manoplas têm relevo e usariam milhares de linhas sem valor visual.
// 4. Junta tudo em poucas primitivas, simplifica a superfície, quantiza e comprime com meshopt.
import { mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { dedup, flatten, join, meshopt, prune, quantize, simplify, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { BufferAttribute, BufferGeometry, EdgesGeometry, Matrix4 } from 'three';
import { removeLogoTriangles, ROOT as root, SOURCE } from './model-shared.mjs';

const OUTPUT = resolve(root, 'assets/models/patinete-zforce.glb');

// Materiais que viram "destaque" (arestas na cor da marca).
const HIGHLIGHT = /Vermelho|Refletor|Reflectores|Vidro|Paine|Botoes/;
// Limiar de ângulo (graus) para considerar uma aresta: maior = menos linhas.
// Pneus, manoplas e o tapete de pontos (Roda_1) têm relevo fino que cintilaria ao girar.
const edgeThreshold = material =>
  /Pneu/.test(material) ? 70 : /Metal_Preto/.test(material) ? 65 : /Roda_1/.test(material) ? 58 : 32;


await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;

const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({
  'meshopt.encoder': MeshoptEncoder,
});
const doc = await io.read(SOURCE);
const docRoot = doc.getRoot();
const buffer = docRoot.listBuffers()[0];

const materials = {
  corpo: doc.createMaterial('corpo').setBaseColorFactor([0.08, 0.08, 0.09, 1]).setMetallicFactor(0.3).setRoughnessFactor(0.6),
  destaque: doc.createMaterial('destaque').setBaseColorFactor([1, 0.42, 0.07, 1]).setMetallicFactor(0).setRoughnessFactor(0.5),
};
const edges = { corpo: [], destaque: [] };
const stats = { triangulosDoLogoRemovidos: 0, triangulosOriginais: 0 };


for (const node of docRoot.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  stats.triangulosDoLogoRemovidos += removeLogoTriangles(node);
  const world = new Matrix4().fromArray(node.getWorldMatrix());
  for (const prim of mesh.listPrimitives()) {
    const materialName = prim.getMaterial()?.getName() || '';
    const group = HIGHLIGHT.test(materialName) ? 'destaque' : 'corpo';
    const position = prim.getAttribute('POSITION');
    const indices = prim.getIndices();
    stats.triangulosOriginais += (indices ? indices.getCount() : position.getCount()) / 3;

    // Arestas calculadas na malha original (antes de simplificar), já em coordenadas de mundo.
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(position.getArray()), 3));
    if (indices) geometry.setIndex(new BufferAttribute(new Uint32Array(indices.getArray()), 1));
    geometry.applyMatrix4(world);
    const edgeGeometry = new EdgesGeometry(geometry, edgeThreshold(materialName));
    edges[group].push(edgeGeometry.getAttribute('position').array);
    geometry.dispose();
    edgeGeometry.dispose();

    prim.setMaterial(materials[group]);
    for (const semantic of prim.listSemantics()) {
      if (semantic !== 'POSITION' && semantic !== 'NORMAL') prim.setAttribute(semantic, null);
    }
  }
}

// Texturas, materiais e acessores que ficaram sem uso.
docRoot.listTextures().forEach(texture => texture.dispose());
await doc.transform(prune());

await doc.transform(
  dedup(),
  flatten(),
  join({ keepNamed: false }),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0.4, error: 0.0008 }),
);

// Uma malha de linhas (dois grupos) ao lado da superfície.
const edgeMesh = doc.createMesh('arestas');
for (const [group, chunks] of Object.entries(edges)) {
  const length = chunks.reduce((sum, a) => sum + a.length, 0);
  const merged = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  const accessor = doc.createAccessor(`arestas-${group}`).setType('VEC3').setArray(merged).setBuffer(buffer);
  edgeMesh.addPrimitive(
    doc.createPrimitive().setMode(1 /* LINES */).setAttribute('POSITION', accessor).setMaterial(materials[group]),
  );
}
const scene = docRoot.getDefaultScene() || docRoot.listScenes()[0];
const edgeNode = doc.createNode('arestas').setMesh(edgeMesh);
scene.addChild(edgeNode);

const bounds = getBounds(scene);
scene.setExtras({
  fonte: '2022 Xiaomi Mi Scooter por tonielpro520 (Sketchfab), CC-BY-4.0, modificado para a Z-Force',
  limites: { min: bounds.min, max: bounds.max },
});
docRoot.listNodes().forEach(node => {
  if (node !== edgeNode && !node.getMesh() && node.listChildren().length === 0) node.dispose();
});

await doc.transform(prune(), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));

mkdirSync(dirname(OUTPUT), { recursive: true });
await io.write(OUTPUT, doc);

let surfaceTriangles = 0;
let edgeSegments = 0;
for (const mesh of docRoot.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const count = prim.getIndices() ? prim.getIndices().getCount() : prim.getAttribute('POSITION').getCount();
    if (prim.getMode() === 4) surfaceTriangles += count / 3;
    else edgeSegments += count / 2;
  }
}
console.log({
  arquivo: OUTPUT.replace(root, '.'),
  tamanhoKB: Math.round(statSync(OUTPUT).size / 1024),
  triangulosOriginais: stats.triangulosOriginais,
  triangulosSuperficie: surfaceTriangles,
  segmentosDeAresta: edgeSegments,
  primitivas: docRoot.listMeshes().reduce((n, m) => n + m.listPrimitives().length, 0),
  triangulosDoLogoRemovidos: stats.triangulosDoLogoRemovidos,
});
