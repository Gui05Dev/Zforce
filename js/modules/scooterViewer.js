// Three.js do "Diagnóstico interativo": modelo, câmera, luzes, OrbitControls e projeção dos hotspots.
// Carregado sob demanda (import dinâmico) quando a seção se aproxima da tela.
// Não anima nada fora do canvas além da posição (transform) dos hotspots, que só este módulo escreve.
import {
  ACESFilmicToneMapping,
  Box3,
  CanvasTexture,
  DirectionalLight,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Spherical,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const MAX_DPR = 1.5;
const deg = MathUtils.degToRad;
// Decodificação da malha comprimida fora da thread principal (sem travar a rolagem).
MeshoptDecoder.useWorkers(2);

const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Sombra de contato: gradiente radial pintado uma vez num canvas (sem shadow map). */
function buildShadow(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(0,0,0,0.75)');
  gradient.addColorStop(0.55, 'rgba(0,0,0,0.35)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new CanvasTexture(canvas);
  const mesh = new Mesh(
    new PlaneGeometry(size.x * 2.6, size.z * 1.25),
    new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.002;
  return { mesh, dispose: () => [texture, mesh.geometry, mesh.material].forEach(item => item.dispose()) };
}

async function loadModel(urls, onProgress) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  let lastError;
  // Lista de tentativas em ordem de preferência. Hoje só o GLB otimizado é publicado; se ele falhar,
  // quem chama cai para a imagem ilustrativa (ver interactiveDiagnostic.js).
  for (const url of urls) {
    try {
      return await loader.loadAsync(url, event => {
        if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
      });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/**
 * @param {object} options
 * @param {HTMLElement} options.container onde o canvas é inserido (define o tamanho)
 * @param {HTMLElement} options.stage área que recebe os hotspots (mesmo tamanho do container)
 * @param {{ id: string, posicao: number[], vista: { azimute: number, polar: number } }[]} options.components
 * @param {Map<string, HTMLElement>} options.hotspotElements
 * @param {{ fov: number, vistaInicial: { azimute: number, polar: number }, polarMin: number, polarMax: number }} options.camera
 * @param {string[]} options.urls
 * @param {boolean} options.reducedMotion
 * @param {boolean} options.touch
 * @param {(ratio: number) => void} [options.onProgress]
 * @param {() => void} [options.onInteract] primeira interação do visitante com o modelo
 */
export async function createScooterViewer({
  container,
  stage,
  components,
  hotspotElements,
  camera: cameraConfig,
  urls,
  reducedMotion,
  touch,
  onProgress = () => {},
  onInteract = () => {},
}) {
  performance.mark('zf:diag:inicio');
  const gltf = await loadModel(urls, onProgress);
  performance.mark('zf:diag:modelo');

  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  // Em produção não lê o log de compilação dos shaders (mais rápido e sem avisos do compilador do
  // Windows/ANGLE no console); no desenvolvimento a verificação continua ligada.
  renderer.debug.checkShaderErrors = Boolean(import.meta.env?.DEV);
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');

  const scene = new Scene();
  // Só luzes diretas (sem mapa de ambiente/PMREM): menos shaders para compilar e nenhum reflexo pesado.
  scene.add(new HemisphereLight('#e8ebf2', '#1a1a1d', 1.35));
  const key = new DirectionalLight('#ffffff', 2.3);
  key.position.set(-2.4, 3.2, 2.2);
  const rim = new DirectionalLight('#ff6a13', 4); // luz de recorte laranja, por trás
  rim.position.set(2.6, 1.6, -2.8);
  const fill = new DirectionalLight('#b4bccb', 0.9);
  fill.position.set(2, 0.5, 2.5);
  scene.add(key, rim, fill);

  // Modelo apoiado no chão (y = 0) e centralizado em x/z. Os hotspots são filhos do modelo:
  // usam as mesmas coordenadas do arquivo original.
  const model = gltf.scene;
  const box = new Box3().setFromObject(model);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  model.position.set(-center.x, -box.min.y, -center.z);
  scene.add(model);
  const shadow = buildShadow(size);
  scene.add(shadow.mesh);

  const anchors = components.map(component => {
    const node = new Object3D();
    node.position.fromArray(component.posicao);
    model.add(node);
    return { id: component.id, node, vista: component.vista, el: hotspotElements.get(component.id) };
  });

  const camera = new PerspectiveCamera(cameraConfig.fov, 1, 0.05, 30);
  // Mira um pouco abaixo do meio: com a câmera levemente elevada, as rodas pedem mais espaço embaixo.
  const target = new Vector3(0, size.y * 0.46, 0);
  const radius = Math.hypot(size.x, size.y, size.z) / 2;

  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(target);
  controls.enablePan = false;
  controls.enableZoom = false; // a roda do mouse continua rolando a página
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.75;
  controls.minPolarAngle = deg(cameraConfig.polarMin); // nunca de cima para baixo nem por baixo do chão
  controls.maxPolarAngle = deg(cameraConfig.polarMax);
  controls.autoRotate = !reducedMotion;
  controls.autoRotateSpeed = 0.45; // ≈ 2 min por volta
  // Compila os shaders em paralelo (KHR_parallel_shader_compile) antes de mostrar o canvas: no
  // Windows/Direct3D a compilação síncrona no primeiro quadro chegava a travar a página por ~2 s.
  camera.aspect = container.clientWidth / Math.max(1, container.clientHeight);
  camera.position.set(0, target.y, radius * 3);
  camera.lookAt(target);
  await renderer.compileAsync(scene, camera);
  performance.mark('zf:diag:shaders');

  container.appendChild(canvas);
  if (touch) {
    // No toque só gira na horizontal: o arraste vertical continua rolando a página.
    canvas.style.touchAction = 'pan-y';
    controls.minPolarAngle = controls.maxPolarAngle = deg(cameraConfig.vistaInicial.polar);
  }

  const spherical = new Spherical();
  const placeCamera = ({ azimute, polar }) => {
    spherical.set(camera.position.distanceTo(target) || 1, deg(polar), deg(azimute));
    camera.position.setFromSpherical(spherical).add(target);
    camera.lookAt(target);
  };

  let width = 0;
  let height = 0;
  const fit = () => {
    width = container.clientWidth;
    height = container.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Distância para o patinete caber na menor dimensão do quadro (retrato no celular). A esfera
    // envolvente sobra muito (o patinete é fino): 0,86 do raio deixa o modelo grande sem cortar ao girar.
    const vFov = deg(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const distance = (radius * 0.86) / Math.sin(Math.min(vFov, hFov) / 2);
    controls.minDistance = controls.maxDistance = distance;
    camera.position.sub(target).setLength(distance).add(target);
    camera.updateProjectionMatrix();
    needsRender = true;
  };

  let needsRender = true;
  let tween = null;
  let interacted = false;

  const markInteraction = () => {
    if (interacted) return;
    interacted = true;
    controls.autoRotate = false; // não volta sozinho enquanto o visitante examina
    onInteract();
  };
  controls.addEventListener('start', () => {
    tween = null;
    markInteraction();
  });

  // Hotspots: projeção das âncoras → pixels do palco, presos às bordas para nunca sair do quadro.
  const projected = new Vector3();
  const EDGE = 26;
  const projectHotspots = () => {
    for (const { node, el } of anchors) {
      if (!el) continue;
      node.getWorldPosition(projected).project(camera);
      const x = MathUtils.clamp(((projected.x + 1) / 2) * width, EDGE, width - EDGE);
      const y = MathUtils.clamp(((1 - projected.y) / 2) * height, EDGE, height - EDGE);
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    }
  };

  let lastTime = 0;
  const lastRendered = new Vector3();
  const MIN_MOVE_SQ = 1e-3 ** 2; // 1 mm: menos de meio pixel na distância da câmera
  let rafId = 0;
  let onScreen = false;
  const frame = now => {
    rafId = requestAnimationFrame(frame);
    const delta = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    if (tween) {
      const t = Math.min(1, (performance.now() - tween.start) / tween.duration);
      const k = easeInOut(t);
      placeCamera({
        azimute: tween.from.azimute + (tween.to.azimute - tween.from.azimute) * k,
        polar: tween.from.polar + (tween.to.polar - tween.from.polar) * k,
      });
      needsRender = true;
      if (t >= 1) tween = null;
    }
    // update() devolve true enquanto a câmera se move (autorrotação ou inércia). No fim da inércia os
    // deslocamentos ficam abaixo de um pixel por segundos: esses quadros não são redesenhados.
    const moved = controls.update(delta) && camera.position.distanceToSquared(lastRendered) > MIN_MOVE_SQ;
    if (!needsRender && !moved) return; // parado: nenhum draw call
    needsRender = false;
    lastRendered.copy(camera.position);
    renderer.render(scene, camera);
    projectHotspots();
  };
  const start = () => {
    if (rafId || !onScreen || document.hidden) return;
    lastTime = performance.now();
    rafId = requestAnimationFrame(frame);
  };
  const stop = () => {
    cancelAnimationFrame(rafId);
    rafId = 0;
  };

  const resizeObserver = new ResizeObserver(fit);
  resizeObserver.observe(container);
  const visibility = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    if (onScreen) {
      needsRender = true;
      start();
    } else stop();
  });
  visibility.observe(stage);
  const onVisibilityChange = () => (document.hidden ? stop() : start());
  document.addEventListener('visibilitychange', onVisibilityChange);

  placeCamera(cameraConfig.vistaInicial);
  fit();
  controls.update();
  renderer.render(scene, camera);
  projectHotspots();
  performance.mark('zf:diag:primeiro-quadro');

  let destroyed = false;
  let onLost = () => {};
  const onContextLost = event => {
    event.preventDefault();
    destroy();
    onLost();
  };
  canvas.addEventListener('webglcontextlost', onContextLost);

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    stop();
    resizeObserver.disconnect();
    visibility.disconnect();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    controls.dispose();
    model.traverse(object => {
      if (!object.isMesh) return;
      object.geometry.dispose();
      for (const material of [object.material].flat()) {
        Object.values(material).forEach(value => value?.isTexture && value.dispose());
        material.dispose();
      }
    });
    shadow.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
    anchors.forEach(({ el }) => el && (el.style.transform = ''));
  }

  return {
    canvas,
    /** Gira a câmera até a vista do componente (instantâneo com movimento reduzido). */
    focus(id) {
      const anchor = anchors.find(a => a.id === id);
      if (!anchor) return;
      markInteraction();
      const current = new Spherical().setFromVector3(camera.position.clone().sub(target));
      const from = { azimute: MathUtils.radToDeg(current.theta), polar: MathUtils.radToDeg(current.phi) };
      const polar = touch ? cameraConfig.vistaInicial.polar : MathUtils.clamp(anchor.vista.polar, cameraConfig.polarMin, cameraConfig.polarMax);
      // Caminho mais curto no azimute.
      let azimute = anchor.vista.azimute;
      while (azimute - from.azimute > 180) azimute -= 360;
      while (azimute - from.azimute < -180) azimute += 360;
      if (reducedMotion) {
        placeCamera({ azimute, polar });
        controls.update();
        needsRender = true;
        return;
      }
      tween = { from, to: { azimute, polar }, start: performance.now(), duration: 900 };
    },
    /** Quadro atual + posições dos hotspots em % (usado pelo script que gera a imagem de fallback). */
    snapshot(type = 'image/webp', quality = 0.9) {
      renderer.render(scene, camera);
      projectHotspots();
      const positions = anchors.map(({ id, node }) => {
        node.getWorldPosition(projected).project(camera);
        return { id, x: +(((projected.x + 1) / 2) * 100).toFixed(1), y: +(((1 - projected.y) / 2) * 100).toFixed(1) };
      });
      return { dataUrl: canvas.toDataURL(type, quality), positions };
    },
    onLost(callback) {
      onLost = callback;
    },
    destroy,
  };
}
