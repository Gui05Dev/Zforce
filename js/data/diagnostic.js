// Configuração única do "Diagnóstico interativo" (seção #como-funciona).
// Usada no build (vite.config.js gera o HTML da seção) e no navegador (interactiveDiagnostic.js e
// scooterViewer.js). Para ajustar um ponto, textos ou mensagens, altere somente este arquivo.
//
// SOBRE O MAPEAMENTO DAS PEÇAS
// O modelo (Sketchfab) tem malhas com nomes genéricos (Object_2, Object_3…) e o exportador fundiu
// peças diferentes na mesma malha por material. Por isso nenhum hotspot depende de nome de malha:
// cada um é uma coordenada 3D escolhida pela geometria (caixas das peças) e conferida visualmente.
// As posições são aproximadas e indicam a REGIÃO do componente, não a peça exata.
//
// Sistema de coordenadas do modelo: metros, Y para cima, frente do patinete em +Z, centro do deck
// perto de x = −0,06. Vale para scene.gltf e para scene-otimizado.glb (mesmas coordenadas).
// `vista`: ângulos da câmera ao selecionar o componente (graus). azimute: 0 = olhando a frente
// (câmera em +Z), −90 = lado direito do patinete, 180 = traseira. polar: 90 = horizontal.
// `poster`: posição (%) do ponto na imagem de fallback, gerada da vista inicial (npm run diagnostic:poster).
import { whatsappUrl } from './contact.js';

export const MODEL = {
  // Caminhos relativos à página (equivalem a /assets/models/xiaomi-scooter/… na raiz do site e
  // continuam válidos se o site for publicado numa subpasta).
  otimizado: 'assets/models/xiaomi-scooter/scene-otimizado.glb',
  original: 'assets/models/xiaomi-scooter/scene.gltf',
  poster: { src: 'assets/diagnostico/patinete-diagnostico.webp', width: 1200, height: 900 },
  descricao:
    'Modelo 3D ilustrativo de um patinete elétrico, visto em três quartos. Cinco pontos marcam as regiões de ' +
    'energia e bateria, motor e controlador, pneus e freios, painel e acelerador, e estrutura. ' +
    'A mesma lista de componentes está disponível ao lado, em botões.',
  creditoCurto: 'Modelo meramente ilustrativo.',
};

export const CAMERA = {
  fov: 30,
  vistaInicial: { azimute: -62, polar: 74 },
  polarMin: 52,
  polarMax: 84,
};

export const COMPONENTS = [
  {
    id: 'energia',
    nome: 'Energia e bateria',
    resumo: 'A bateria fica dentro do deck, sob os pés.',
    posicao: [-0.06, 0.185, -0.06],
    vista: { azimute: -70, polar: 58 },
    poster: { x: 45.3, y: 72.9 },
    sintomas: ['O patinete não liga.', 'Autonomia muito baixa.', 'Não completa a carga.', 'Bateria descarrega rapidamente.'],
  },
  {
    id: 'motor',
    nome: 'Motor e controlador',
    resumo: 'O motor fica no cubo da roda dianteira; o controlador, na frente do deck.',
    posicao: [-0.063, 0.113, 0.418],
    vista: { azimute: -38, polar: 78 },
    poster: { x: 68.2, y: 84.4 },
    sintomas: ['Perdeu força.', 'Motor apresenta ruído.', 'Acelerador falha.', 'Patinete liga, mas não se movimenta.'],
  },
  {
    id: 'rodas',
    nome: 'Pneus e freios',
    resumo: 'Pneus, câmaras e o freio a disco da roda traseira.',
    posicao: [-0.063, 0.215, -0.45],
    vista: { azimute: -128, polar: 76 },
    poster: { x: 28.9, y: 66.5 },
    sintomas: ['Pneu furado.', 'Freio fraco.', 'Barulho durante a frenagem.', 'Roda desalinhada ou com folga.'],
  },
  {
    id: 'painel',
    nome: 'Painel e acelerador',
    resumo: 'Visor, botões e acelerador no guidão.',
    posicao: [-0.065, 1.105, 0.235],
    vista: { azimute: -40, polar: 60 },
    poster: { x: 60, y: 9.3 },
    sintomas: ['Painel não liga.', 'Código de erro no visor.', 'Acelerador intermitente.', 'Informações incorretas no painel.'],
  },
  {
    id: 'estrutura',
    nome: 'Estrutura e revisão',
    resumo: 'Coluna, articulação de dobra, guidão e fixações.',
    posicao: [-0.03, 0.5, 0.29],
    vista: { azimute: -95, polar: 80 },
    poster: { x: 62.9, y: 55.2 },
    sintomas: ['Folgas no guidão.', 'Ruídos durante o uso.', 'Vibração excessiva.', 'Necessidade de revisão preventiva.'],
  },
];

export const STEPS = [
  { numero: '01', rotulo: 'Conversa', titulo: 'Primeiro, a conversa', texto: 'O cliente envia uma mensagem com foto ou vídeo.' },
  { numero: '02', rotulo: 'Avaliação', titulo: 'Depois, a avaliação', texto: 'A Z-Force verifica o veículo e identifica o problema.' },
  { numero: '03', rotulo: 'Orçamento', titulo: 'Orçamento antes do serviço', texto: 'O cliente recebe o valor e decide se deseja aprovar.' },
  { numero: '04', rotulo: 'Entrega', titulo: 'Pronto para rodar', texto: 'Após o serviço, o veículo é retirado ou entregue conforme combinado.' },
];

/** Mensagem do WhatsApp para um componente e (opcionalmente) um sintoma. */
export function diagnosticMessage(component, symptom) {
  const sintoma = symptom ? symptom.replace(/\.$/, '') : 'ainda não sei qual é o sintoma exato';
  return (
    'Olá! Vi o diagnóstico interativo no site da Z-Force.\n' +
    `Meu patinete apresenta um possível problema em ${component.nome}:\n` +
    `${sintoma}.\n` +
    'Gostaria de solicitar uma avaliação.'
  );
}

export const diagnosticUrl = (component, symptom) => whatsappUrl(diagnosticMessage(component, symptom));

const escapeHtml = value =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const WHATS_ICON =
  '<svg class="botao-icone" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3a12 12 0 0 0-10.3 18.2L4 28l7-1.8A12 12 0 1 0 16 3Z"/></svg>';

/**
 * HTML da seção, gerado no build (Node, sem DOM). Sem JavaScript no navegador, tudo fica legível:
 * a imagem ilustrativa, os cinco componentes com sintomas e links de WhatsApp, e as etapas.
 */
export function renderDiagnostic() {
  const e = escapeHtml;
  const pad = n => String(n).padStart(2, '0');

  const hotspots = COMPONENTS.map(
    (c, i) => `
          <span class="diagnostico-ponto" data-hotspot="${c.id}" style="--x: ${c.poster.x}%; --y: ${c.poster.y}%">
            <button type="button" class="diagnostico-ponto-botao" data-select="${c.id}" aria-pressed="false"
              aria-controls="diagnostico-card-${c.id}" aria-label="${e(c.nome)}">
              <span class="diagnostico-ponto-numero" aria-hidden="true">${i + 1}</span>
              <span class="diagnostico-ponto-nome" aria-hidden="true">${e(c.nome)}</span>
            </button>
          </span>`,
  ).join('');

  const list = COMPONENTS.map(
    (c, i) => `
          <button type="button" class="diagnostico-componente" data-select="${c.id}" aria-pressed="false"
            aria-controls="diagnostico-card-${c.id}">
            <span class="diagnostico-componente-numero" aria-hidden="true">${pad(i + 1)}</span>
            <span>${e(c.nome)}</span>
          </button>`,
  ).join('');

  const cards = COMPONENTS.map(
    (c, i) => `
          <article class="diagnostico-card" id="diagnostico-card-${c.id}" data-card-component="${c.id}" aria-labelledby="diagnostico-titulo-${c.id}">
            <p class="diagnostico-card-rotulo">Componente <span>${pad(i + 1)}</span></p>
            <h3 id="diagnostico-titulo-${c.id}">${e(c.nome)}</h3>
            <p class="diagnostico-card-resumo">${e(c.resumo)}</p>
            <p class="diagnostico-card-texto" id="diagnostico-instrucao-${c.id}">Sintomas mais comuns. Selecione o que mais se parece com o seu:</p>
            <ul class="diagnostico-sintomas" aria-labelledby="diagnostico-instrucao-${c.id}">${c.sintomas
              .map(
                s => `
              <li><button type="button" class="diagnostico-sintoma" data-symptom="${e(s)}" aria-pressed="false">${e(s)}</button></li>`,
              )
              .join('')}
            </ul>
            <a class="botao botao--grande diagnostico-cta" href="${e(diagnosticUrl(c))}" target="_blank" rel="noopener noreferrer" data-diagnostic-cta>
              ${WHATS_ICON}
              Estou com este problema
            </a>
          </article>`,
  ).join('');

  const steps = STEPS.map(
    s => `
        <li class="etapa" data-reveal-block>
          <p class="etapa-rotulo"><span>${s.numero}</span> ${e(s.rotulo)}</p>
          <h3>${e(s.titulo)}</h3>
          <p>${e(s.texto)}</p>
        </li>`,
  ).join('');

  return `
      <div class="diagnostico">
        <div class="diagnostico-palco" data-reveal-block>
          <figure class="diagnostico-visual" data-diagnostic-stage aria-describedby="diagnostico-descricao">
            <img class="diagnostico-poster" src="${e(MODEL.poster.src)}" width="${MODEL.poster.width}" height="${MODEL.poster.height}"
              alt="" loading="lazy" decoding="async" data-diagnostic-poster>
            <div class="diagnostico-canvas" data-diagnostic-canvas aria-hidden="true"></div>
            <div class="diagnostico-pontos" data-diagnostic-hotspots>${hotspots}
            </div>
            <p class="diagnostico-dica" aria-hidden="true" data-diagnostic-hint>
              <svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6M17 2v4.5h-4.5M7 22v-4.5h4.5"/></svg>
              Arraste para girar
            </p>
            <p class="diagnostico-status" role="status" data-diagnostic-status></p>
            <figcaption class="sr-only" id="diagnostico-descricao">${e(MODEL.descricao)}</figcaption>
          </figure>
          <p class="diagnostico-aviso">${e(MODEL.creditoCurto)}</p>
        </div>

        <div class="diagnostico-info" data-reveal-block>
          <div class="diagnostico-componentes" role="group" aria-label="Componentes do patinete">${list}
          </div>
          <div class="diagnostico-cards" data-diagnostic-cards>${cards}
          </div>
        </div>
      </div>

      <div class="etapas-bloco">
        <h3 class="etapas-titulo">Como funciona o atendimento</h3>
        <ol class="etapas">${steps}
        </ol>
      </div>`;
}
