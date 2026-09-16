// Utilidades compartilhadas pelos scripts que geram versões otimizadas do modelo do patinete.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Matrix4, Vector3 } from 'three';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Modelo original (Sketchfab, CC-BY-4.0). Fica em assets-src/ — fora de public/, portanto
// versionado no Git mas nunca copiado para o dist/. Nunca é alterado: os scripts só leem daqui.
export const SOURCE = resolve(ROOT, 'assets-src/models/xiaomi-scooter/scene.gltf');

// Símbolo do fabricante na placa da frente do deck (coordenadas de mundo, metros; frente em +Z).
// Localizado por mapa de vértices: glifo de ~3,5 cm em x −0,07…−0,035, z 0,09…0,12, y 0,1445…0,1469,
// dentro da malha "Object_36" (o exportador do Sketchfab fundiu várias peças por material, então a
// malha inteira não pode ser descartada). O glifo é uma superfície fina sobre a placa: seus triângulos
// são removidos e a placa lisa por baixo aparece.
export const LOGO = {
  nodes: new Set(['Object_36']),
  min: [-0.078, 0.14, 0.082],
  max: [-0.028, 0.152, 0.128],
};

/**
 * Remove os triângulos do glifo (os três vértices dentro da caixa LOGO) de um nó do glTF-Transform.
 * @returns {number} triângulos removidos
 */
export function removeLogoTriangles(node) {
  if (!LOGO.nodes.has(node.getName()) || !node.getMesh()) return 0;
  const world = new Matrix4().fromArray(node.getWorldMatrix());
  const v = new Vector3();
  let removed = 0;
  for (const prim of node.getMesh().listPrimitives()) {
    const position = prim.getAttribute('POSITION').getArray();
    const indices = prim.getIndices();
    const index = indices.getArray();
    const insideBox = i => {
      v.set(position[i * 3], position[i * 3 + 1], position[i * 3 + 2]).applyMatrix4(world);
      return [v.x, v.y, v.z].every((value, axis) => value >= LOGO.min[axis] && value <= LOGO.max[axis]);
    };
    const kept = [];
    for (let t = 0; t < index.length; t += 3) {
      if (insideBox(index[t]) && insideBox(index[t + 1]) && insideBox(index[t + 2])) {
        removed++;
        continue;
      }
      kept.push(index[t], index[t + 1], index[t + 2]);
    }
    indices.setArray(new Uint32Array(kept));
  }
  return removed;
}
