// Three.js: fundo do hero. Carregado sob demanda (import dinâmico) e só quando o aparelho aguenta.
// Três camadas leves: partículas em fluxo (movimento calculado na GPU), uma rede de pontos
// conectados calculada uma vez e poucos "fios de energia" com um pulso da marca percorrendo.
// No desktop, uma quarta camada opcional (threeScooter.js, também sob demanda) desenha o patinete 3D
// no mesmo contexto e no mesmo loop, sobre a área do desenho técnico.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Line,
  LineSegments,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from 'three';

// Azul da marca (assets/zforce-logo-animated.svg): partículas, fios de energia e pulsos.
const BRAND = new Color('#00c2d1');
const WARM_WHITE = new Color('#f4efe8');

/**
 * @param {HTMLElement} host elemento que recebe o canvas
 * @param {{ particles: number, nodes: number, streams: number, maxDpr: number, fps: number, pointer: boolean, scooter: boolean }} config
 * @param {{ drawing?: SVGSVGElement | null, onLost?: () => void }} [options]
 * @returns {{ destroy: () => void, scooterReady: Promise<boolean>, revealScooter: () => void }}
 */
export function createHeroScene(host, config, { drawing = null, onLost = () => {} } = {}) {
  const withScooter = Boolean(config.scooter && drawing);
  // Antialias só com o patinete: as arestas de 1 px serrilhariam; as partículas não precisam.
  const renderer = new WebGLRenderer({ antialias: withScooter, alpha: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false; // um clear por quadro; a camada do patinete só limpa a profundidade
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, config.maxDpr));
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);

  const scene = new Scene();
  const camera = new PerspectiveCamera(55, 1, 0.1, 60);
  camera.position.set(0, 0, 12);

  const world = new Group();
  scene.add(world);
  const disposables = [];

  const particles = buildParticles(config.particles);
  const network = buildNetwork(config.nodes);
  const streams = buildStreams(config.streams);
  world.add(particles.object, network.object, ...streams.objects);
  disposables.push(particles, network, streams);

  // Estado do ponteiro suavizado: a câmera segue devagar, sem tranco.
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const onPointerMove = event => {
    pointer.tx = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = (event.clientY / window.innerHeight) * 2 - 1;
  };
  if (config.pointer) window.addEventListener('pointermove', onPointerMove, { passive: true });

  const resize = () => {
    const { clientWidth: width, clientHeight: height } = host;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Em telas estreitas afasta a câmera para o campo não parecer "ampliado".
    camera.position.z = width < 700 ? 15 : 12;
    camera.updateProjectionMatrix();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  resize();

  // Loop só roda com a aba visível e o hero na tela; com FPS limitado em celulares.
  let onScreen = true;
  let rafId = 0;
  let last = 0;
  let elapsed = 0;
  const frameInterval = 1000 / config.fps;

  const frame = now => {
    rafId = requestAnimationFrame(frame);
    const delta = now - last;
    if (delta < frameInterval - 1) return;
    last = now;
    elapsed += Math.min(delta, 50) / 1000;

    pointer.x += (pointer.tx - pointer.x) * 0.04;
    pointer.y += (pointer.ty - pointer.y) * 0.04;
    camera.position.x = pointer.x * 0.9;
    camera.position.y = -pointer.y * 0.55;
    camera.lookAt(0, 0, 0);

    world.rotation.y = Math.sin(elapsed * 0.05) * 0.12;
    network.object.rotation.z = Math.sin(elapsed * 0.08) * 0.05;
    particles.material.uniforms.uTime.value = elapsed;
    streams.material.uniforms.uTime.value = elapsed;

    renderer.clear();
    renderer.render(scene, camera);
    scooter?.render(elapsed);
    if (!canvas.classList.contains('is-ready')) canvas.classList.add('is-ready');
  };

  const start = () => {
    if (rafId || !onScreen || document.hidden) return;
    last = performance.now();
    rafId = requestAnimationFrame(frame);
  };
  const stop = () => {
    cancelAnimationFrame(rafId);
    rafId = 0;
  };

  const visibilityObserver = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    if (onScreen) start();
    else stop();
  });
  visibilityObserver.observe(host);

  const onVisibility = () => (document.hidden ? stop() : start());
  document.addEventListener('visibilitychange', onVisibility);

  let destroyed = false;
  // Patinete 3D: módulo e modelo baixados depois do fundo, sem atrasar a entrada do hero.
  let scooter = null;
  const scooterReady = withScooter
    ? import('./threeScooter.js')
        .then(({ createScooterLayer }) => createScooterLayer({ renderer, drawing, pointer }))
        .then(layer => {
          if (destroyed) {
            layer.dispose();
            return false;
          }
          scooter = layer;
          return true;
        })
    : Promise.resolve(false);

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    stop();
    scooter?.dispose();
    scooter = null;
    visibilityObserver.disconnect();
    resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    disposables.forEach(item => item.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  };

  // Se o contexto cair (GPU ocupada, driver), some o canvas, o fundo em CSS permanece e o desenho
  // SVG volta (onLost).
  const onContextLost = event => {
    event.preventDefault();
    destroy();
    onLost();
  };
  canvas.addEventListener('webglcontextlost', onContextLost);

  start();
  return { destroy, scooterReady, revealScooter: () => scooter?.reveal() };
}

function buildParticles(count) {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    // Mais densidade à direita, onde fica o desenho do patinete.
    const bias = Math.random() < 0.55 ? Math.random() * 0.8 + 0.2 : Math.random() * 2 - 1;
    positions[i * 3] = bias * 15;
    positions[i * 3 + 1] = (Math.random() * 2 - 1) * 8;
    positions[i * 3 + 2] = Math.random() * -14 + 3;
    seeds[i * 3] = Math.random(); // velocidade
    seeds[i * 3 + 1] = Math.random(); // tom (azul da marca x branco)
    seeds[i * 3 + 2] = Math.random() * Math.PI * 2; // fase
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new BufferAttribute(seeds, 3));

  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uBrand: { value: BRAND },
      uWhite: { value: WARM_WHITE },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aSeed;
      uniform float uTime;
      varying float vTone;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        // Fluxo contínuo da esquerda para a direita, com retorno invisível.
        float speed = 0.25 + aSeed.x * 0.55;
        p.x = mod(p.x + uTime * speed + 15.0, 30.0) - 15.0;
        p.y += sin(uTime * 0.35 + aSeed.z + p.x * 0.18) * 0.35;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = mix(1.4, 3.6, aSeed.x);
        gl_PointSize = size * (12.0 / -mv.z);
        // Some suavemente nas bordas do fluxo para não "estourar" ao reiniciar.
        float edge = smoothstep(15.0, 11.0, abs(p.x));
        vAlpha = edge * mix(0.25, 0.9, aSeed.x);
        vTone = aSeed.y;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uBrand;
      uniform vec3 uWhite;
      varying float vTone;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float disc = smoothstep(0.5, 0.0, d);
        vec3 color = vTone > 0.62 ? uBrand : uWhite * 0.55;
        gl_FragColor = vec4(color, disc * vAlpha);
      }
    `,
  });

  const object = new Points(geometry, material);
  return {
    object,
    material,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

function buildNetwork(count) {
  const nodes = [];
  for (let i = 0; i < count; i++) {
    nodes.push([Math.random() * 18 - 6, (Math.random() * 2 - 1) * 5.5, Math.random() * -6 - 1]);
  }

  // Conexões calculadas uma única vez (sem custo por quadro).
  const segments = [];
  const maxDistance = 3.1;
  for (let a = 0; a < count; a++) {
    for (let b = a + 1; b < count; b++) {
      const dx = nodes[a][0] - nodes[b][0];
      const dy = nodes[a][1] - nodes[b][1];
      const dz = nodes[a][2] - nodes[b][2];
      if (dx * dx + dy * dy + dz * dz < maxDistance * maxDistance) segments.push(...nodes[a], ...nodes[b]);
    }
  }

  const lineGeometry = new BufferGeometry();
  lineGeometry.setAttribute('position', new BufferAttribute(new Float32Array(segments), 3));
  const lineMaterial = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uColor: { value: BRAND } },
    vertexShader: /* glsl */ `
      varying float vDepth;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDepth = smoothstep(-22.0, -10.0, mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vDepth;
      void main() {
        gl_FragColor = vec4(uColor, 0.11 * vDepth);
      }
    `,
  });

  const object = new LineSegments(lineGeometry, lineMaterial);
  return {
    object,
    dispose() {
      lineGeometry.dispose();
      lineMaterial.dispose();
    },
  };
}

function buildStreams(count) {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: BRAND } },
    vertexShader: /* glsl */ `
      attribute float aProgress;
      attribute float aOffset;
      varying float vProgress;
      varying float vOffset;
      void main() {
        vProgress = aProgress;
        vOffset = aOffset;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      varying float vProgress;
      varying float vOffset;
      void main() {
        float head = fract(uTime * 0.09 + vOffset);
        float dist = vProgress - head;
        // Cauda do pulso atrás da cabeça, fio base quase invisível.
        float pulse = smoothstep(-0.22, 0.0, dist) * step(dist, 0.0);
        float alpha = 0.05 + pulse * 0.75;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
  });

  const objects = [];
  const geometries = [];
  const segments = 140;
  for (let s = 0; s < count; s++) {
    const positions = new Float32Array(segments * 3);
    const progress = new Float32Array(segments);
    const offsets = new Float32Array(segments).fill(s / count);
    const yBase = -2.6 + s * 2.2;
    const amp = 0.8 + s * 0.35;
    for (let i = 0; i < segments; i++) {
      const t = i / (segments - 1);
      positions[i * 3] = -16 + t * 32;
      positions[i * 3 + 1] = yBase + Math.sin(t * Math.PI * (1.3 + s * 0.4) + s) * amp - t * 1.2;
      positions[i * 3 + 2] = -2.5 - s * 1.4;
      progress[i] = t;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('aProgress', new BufferAttribute(progress, 1));
    geometry.setAttribute('aOffset', new BufferAttribute(offsets, 1));
    geometries.push(geometry);
    objects.push(new Line(geometry, material));
  }

  return {
    objects,
    material,
    dispose() {
      geometries.forEach(g => g.dispose());
      material.dispose();
    },
  };
}
