// Leitura única das capacidades do aparelho. Funções puras ficam separadas para teste.

/**
 * Decide quanto do fundo 3D o aparelho aguenta.
 *
 * O corte é pelo APARELHO (`touchOnly`: tem toque e nenhum mouse), não pela largura da janela.
 * Um desktop com a janela estreita tem a mesma GPU e menos pixels para desenhar, então recebe a
 * cena completa — inclusive o patinete 3D que entra no lugar do desenho técnico. Como `touchOnly`
 * não muda ao redimensionar, o resultado também não depende do tamanho da janela no carregamento
 * (o ambiente é lido uma única vez, no boot).
 * @param {{ touchOnly: boolean, lowPower: boolean, reducedMotion: boolean, webgl: boolean }} caps
 */
export function getSceneConfig({ touchOnly, lowPower, reducedMotion, webgl }) {
  if (reducedMotion || lowPower || !webgl) return null;
  // scooter: modelo 3D no lugar do desenho técnico. No celular e no tablet fica o SVG.
  return touchOnly
    ? { particles: 520, nodes: 34, streams: 2, maxDpr: 1.25, fps: 30, pointer: false, scooter: false }
    : { particles: 1500, nodes: 72, streams: 3, maxDpr: 1.5, fps: 60, pointer: true, scooter: true };
}

/**
 * Modo do "Diagnóstico interativo". Diferente do fundo do hero, o modelo continua com
 * "reduzir movimento" (só sem autorrotação); a imagem ilustrativa entra sem WebGL, com economia
 * de dados ou em aparelho muito limitado.
 * @returns {'3d' | 'imagem'}
 */
export function getDiagnosticMode({ webgl, saveData, lowPower }) {
  return webgl && !saveData && !lowPower ? '3d' : 'imagem';
}

/**
 * Heurística conservadora: economia de dados ou hardware muito limitado.
 * @param {{ saveData?: boolean, deviceMemory?: number, hardwareConcurrency?: number }} nav
 */
export function isLowPower({ saveData, deviceMemory, hardwareConcurrency } = {}) {
  if (saveData) return true;
  if (typeof deviceMemory === 'number' && deviceMemory <= 2) return true;
  if (typeof hardwareConcurrency === 'number' && hardwareConcurrency <= 2) return true;
  return false;
}

function detectWebGL() {
  try {
    const canvas = document.createElement('canvas');
    // Recusa renderização por software (SwiftShader etc.): nesse caso fica o fundo em CSS.
    const opts = { failIfMajorPerformanceCaveat: true };
    const gl = canvas.getContext('webgl2', opts) || canvas.getContext('webgl', opts);
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export function readEnvironment() {
  const mq = query => window.matchMedia(query).matches;
  const connection = navigator.connection || {};
  const reducedMotion = mq('(prefers-reduced-motion: reduce)');
  const mobile = mq('(max-width: 859px)') || mq('(pointer: coarse)');
  const lowPower = isLowPower({
    saveData: connection.saveData,
    deviceMemory: navigator.deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency,
  });

  let webglAvailable;
  const hasWebGL = () => (webglAvailable ??= detectWebGL());

  return {
    reducedMotion,
    mobile,
    lowPower,
    saveData: Boolean(connection.saveData),
    touchOnly: mq('(pointer: coarse)') && !mq('(any-pointer: fine)'),
    // Fundo do hero: WebGL só é testado se houver chance real de uso (evita criar contexto à toa)
    get webgl() {
      if (this._webgl === undefined) this._webgl = !reducedMotion && !lowPower && hasWebGL();
      return this._webgl;
    },
    /** Suporte a WebGL com aceleração, independente das preferências de movimento. */
    hasWebGL,
  };
}
