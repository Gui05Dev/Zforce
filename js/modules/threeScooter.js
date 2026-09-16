// Patinete 3D do hero: continuação do desenho técnico (Anime.js) quando o aparelho aguenta.
// Não cria renderer, canvas nem loop próprios: é desenhado pelo loop de threeHeroScene.js, no mesmo
// contexto WebGL, recortado (viewport + scissor) exatamente sobre a área do SVG.
//
// Modelo: "2022 Xiaomi Mi Scooter" por tonielpro520 (Sketchfab), CC-BY-4.0, modificado para a Z-Force
// (sem texturas e sem o símbolo do fabricante; ver scripts/optimize-scooter.mjs).
import {
  Box3,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  MathUtils,
  Matrix4,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import modelUrl from '../../assets/models/patinete-zforce.glb?url';

// Verde da marca (assets/zforce-logo-animated.svg): arestas de destaque e luz de recorte.
const BRAND = new Color('#a8e000');
const FOV = 26;
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp01 = t => Math.min(1, Math.max(0, t));

/**
 * Material com "varredura de desenho": fragmentos além de uReveal (ao longo do comprimento do patinete,
 * da traseira para a frente) são descartados; nas linhas, a frente da varredura brilha na cor da marca.
 */
function withReveal(material, uniforms, { glow = false } = {}) {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uToModel;\nvarying float vRevealZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRevealZ = (uToModel * vec4(transformed, 1.0)).z;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uReveal;\nuniform float uRevealMin;\nuniform float uRevealSpan;\nuniform vec3 uGlow;\nvarying float vRevealZ;',
      )
      .replace(
        '#include <clipping_planes_fragment>',
        '#include <clipping_planes_fragment>\nfloat revealT = (vRevealZ - uRevealMin) / uRevealSpan;\nif (revealT > uReveal) discard;',
      );
    if (glow) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        'float front = smoothstep(0.08, 0.0, uReveal - revealT) * step(uReveal, 0.999);\noutgoingLight = mix(outgoingLight, uGlow, front);\ndiffuseColor.a = max(diffuseColor.a, front);\n#include <opaque_fragment>',
      );
    }
  };
  return material;
}

/**
 * @param {{ renderer: import('three').WebGLRenderer, drawing: SVGSVGElement, pointer: { x: number, y: number } }} options
 */
export async function createScooterLayer({ renderer, drawing, pointer }) {
  const figure = drawing.closest('figure') || drawing.parentElement;
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(modelUrl);
  const model = gltf.scene;

  const scene = new Scene();
  scene.add(new HemisphereLight('#c9ccd4', '#0a0a0b', 0.55));
  const key = new DirectionalLight('#ffffff', 1.25);
  key.position.set(-2, 3, 1.5);
  const rim = new DirectionalLight(BRAND, 2.4);
  rim.position.set(2, 1, -2.5);
  scene.add(key, rim);

  // Pivô no centro do patinete; o modelo mantém as coordenadas originais (metros, frente em +Z).
  const box = new Box3().setFromObject(model);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const pivot = new Group();
  model.position.sub(center);
  pivot.add(model);
  scene.add(pivot);

  const uniforms = {
    uReveal: { value: 0 },
    uRevealMin: { value: box.min.z },
    uRevealSpan: { value: size.z },
    uGlow: { value: BRAND },
  };
  const disposables = [];
  model.updateMatrixWorld(true);
  const toModel = new Matrix4().copy(model.matrixWorld).invert();

  model.traverse(object => {
    if (!object.isMesh && !object.isLineSegments) return;
    // Cada malha tem seu próprio uniforme de matriz (posições quantizadas → coordenadas do modelo).
    const own = { ...uniforms, uToModel: { value: new Matrix4().multiplyMatrices(toModel, object.matrixWorld) } };
    const highlight = object.material?.name === 'destaque';
    object.material.dispose();
    if (object.isMesh) {
      object.material = withReveal(
        new MeshStandardMaterial({
          color: highlight ? '#2a1408' : '#141418',
          metalness: 0.35,
          roughness: 0.55,
          // Empurra a superfície para trás: as arestas coplanares ficam sempre visíveis.
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        }),
        own,
      );
    } else {
      object.material = withReveal(
        new LineBasicMaterial({ color: highlight ? BRAND : '#dcdad4', transparent: true, opacity: highlight ? 0.95 : 0.5 }),
        own,
        { glow: true },
      );
    }
    disposables.push(object.geometry, object.material);
  });

  const camera = new PerspectiveCamera(FOV, 1, 0.05, 20);
  const halfFov = MathUtils.degToRad(FOV / 2);
  // Enquadramento pela altura (o patinete é mais alto que comprido): chão perto da base, como no SVG.
  const ndcTop = 0.94;
  const ndcBottom = -0.8;
  const unitsPerNdc = size.y / (ndcTop - ndcBottom);
  const distance = unitsPerNdc / Math.tan(halfFov);
  const lookY = -((ndcTop + ndcBottom) / 2) * unitsPerNdc;

  const SIDE_YAW = 0; // câmera em −X: frente do patinete à direita, igual ao desenho
  const REST_YAW = MathUtils.degToRad(-22);
  const REST_ELEVATION = MathUtils.degToRad(10);
  const state = { revealStart: -1, yaw: SIDE_YAW, elevation: 0, visible: false };
  const canvas = renderer.domElement;

  const reveal = () => {
    if (state.revealStart >= 0) return;
    state.revealStart = performance.now();
    state.visible = true;
    figure.dataset.modelo3d = 'ativo';
  };

  /** Chamado pelo loop do hero, depois do fundo. `elapsed` em segundos. */
  const render = elapsed => {
    if (!state.visible) return;

    // Leituras de layout primeiro (sem intercalar com escritas).
    const canvasRect = canvas.getBoundingClientRect();
    const rect = drawing.getBoundingClientRect();
    const x = rect.left - canvasRect.left;
    const top = rect.top - canvasRect.top;
    if (rect.width < 2 || top > canvasRect.height || top + rect.height < 0) return;

    const t = (performance.now() - state.revealStart) / 1000;
    uniforms.uReveal.value = easeInOut(clamp01(t / 1.4));
    const turn = easeInOut(clamp01((t - 0.8) / 2));
    const idle = clamp01((t - 2.8) / 1.5);
    const sway = Math.sin(elapsed * 0.25) * MathUtils.degToRad(8) * idle;
    state.yaw = MathUtils.lerp(SIDE_YAW, REST_YAW, turn) + sway + pointer.x * MathUtils.degToRad(10) * idle;
    state.elevation = MathUtils.lerp(0, REST_ELEVATION, turn) - pointer.y * MathUtils.degToRad(4) * idle;

    pivot.rotation.y = state.yaw;
    camera.aspect = rect.width / rect.height;
    camera.position.set(-distance * Math.cos(state.elevation), lookY + distance * Math.sin(state.elevation), 0);
    camera.lookAt(0, lookY, 0);
    camera.updateProjectionMatrix();

    const glY = canvasRect.height - (top + rect.height);
    renderer.setViewport(x, glY, rect.width, rect.height);
    renderer.setScissor(x, glY, rect.width, rect.height);
    renderer.setScissorTest(true);
    renderer.clearDepth();
    renderer.render(scene, camera);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, canvasRect.width, canvasRect.height);

  };

  // Shaders compilados em paralelo antes da troca desenho → 3D (sem travar a entrada do hero).
  camera.position.set(-distance, lookY, 0);
  camera.lookAt(0, lookY, 0);
  await renderer.compileAsync(scene, camera);

  const dispose = () => {
    disposables.forEach(item => item.dispose());
    delete figure.dataset.modelo3d;
  };

  return { render, reveal, dispose };
}
