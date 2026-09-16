import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { WHATSAPP_NUMBER, whatsappUrl } from '../../js/data/contact.js';
import { CAMERA, COMPONENTS, MODEL, STEPS, diagnosticMessage, diagnosticUrl, renderDiagnostic } from '../../js/data/diagnostic.js';

const publicFile = path => new URL(`../../public/${path}`, import.meta.url);
// Modelo original: versionado, mas fora de public/ — não é copiado para o dist/.
const sourceFile = path => new URL(`../../assets-src/models/xiaomi-scooter/${path}`, import.meta.url);

test('cinco componentes pedidos, cada um com quatro sintomas', () => {
  assert.deepEqual(
    COMPONENTS.map(c => c.nome),
    ['Energia e bateria', 'Motor e controlador', 'Pneus e freios', 'Painel e acelerador', 'Estrutura e revisão'],
  );
  for (const c of COMPONENTS) {
    assert.equal(c.sintomas.length, 4, c.nome);
    assert.equal(new Set(c.sintomas).size, 4, `${c.nome}: sintomas repetidos`);
  }
});

test('hotspots por coordenada 3D configurável (sem depender de nomes de malha)', () => {
  const raw = readFileSync(new URL('../../js/data/diagnostic.js', import.meta.url), 'utf8');
  assert.doesNotMatch(raw, /Object_\d+'/, 'nenhum componente mapeado para nome de malha');
  for (const c of COMPONENTS) {
    assert.equal(c.posicao.length, 3);
    c.posicao.forEach(v => assert.ok(Number.isFinite(v)));
    // Dentro da caixa do patinete (metros): x −0,2…0,24, y 0…1,14, z −0,54…0,54
    assert.ok(c.posicao[1] >= 0 && c.posicao[1] <= 1.14, `${c.id}: altura fora do patinete`);
    assert.ok(Math.abs(c.posicao[2]) <= 0.54, `${c.id}: fora do comprimento`);
    assert.ok(c.poster.x > 0 && c.poster.x < 100 && c.poster.y > 0 && c.poster.y < 100, `${c.id}: ponto fora da imagem`);
    assert.ok(c.vista.polar >= CAMERA.polarMin && c.vista.polar <= CAMERA.polarMax, `${c.id}: vista fora dos limites da câmera`);
  }
});

test('mensagem do WhatsApp com componente e sintoma, usando o número central', () => {
  const [energia] = COMPONENTS;
  assert.equal(
    diagnosticMessage(energia, 'Não completa a carga.'),
    'Olá! Vi o diagnóstico interativo no site da Z-Force.\n' +
      'Meu patinete apresenta um possível problema em Energia e bateria:\n' +
      'Não completa a carga.\n' +
      'Gostaria de solicitar uma avaliação.',
  );
  assert.match(diagnosticMessage(energia), /ainda não sei qual é o sintoma exato\./);
  const url = diagnosticUrl(energia, 'O patinete não liga.');
  assert.ok(url.startsWith(`https://wa.me/${WHATSAPP_NUMBER}?text=`));
  assert.equal(decodeURIComponent(url.split('text=')[1]), diagnosticMessage(energia, 'O patinete não liga.'));
  assert.equal(whatsappUrl('a b'), `https://wa.me/${WHATSAPP_NUMBER}?text=a%20b`);
});

test('o telefone não é repetido nos arquivos novos do diagnóstico', () => {
  for (const file of ['js/data/diagnostic.js', 'js/modules/interactiveDiagnostic.js', 'js/modules/scooterViewer.js']) {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /5545988037791|98803-7791/, file);
  }
});

test('HTML gerado: botões acessíveis, cards, sintomas, CTA, aviso e quatro etapas', () => {
  const html = renderDiagnostic();
  assert.equal((html.match(/class="diagnostico-ponto-botao"/g) || []).length, 5);
  assert.equal((html.match(/class="diagnostico-componente"/g) || []).length, 5);
  assert.equal((html.match(/data-card-component=/g) || []).length, 5);
  assert.equal((html.match(/data-symptom=/g) || []).length, 20);
  assert.equal((html.match(/aria-pressed="false"/g) || []).length, 5 + 5 + 20);
  assert.equal((html.match(/Estou com este problema/g) || []).length, 5);
  assert.match(html, /Arraste para girar/);
  assert.match(html, /Modelo meramente ilustrativo\./);
  assert.match(html, /id="diagnostico-descricao"/);
  assert.equal((html.match(/class="etapa"/g) || []).length, STEPS.length);
  assert.deepEqual(STEPS.map(s => s.rotulo), ['Conversa', 'Avaliação', 'Orçamento', 'Entrega']);
});

test('modelo original completo em assets-src/ (fonte dos scripts de otimização)', () => {
  const gltf = JSON.parse(readFileSync(sourceFile('scene.gltf'), 'utf8'));
  for (const buffer of gltf.buffers) assert.ok(existsSync(sourceFile(buffer.uri)), buffer.uri);
  for (const image of gltf.images) assert.ok(existsSync(sourceFile(decodeURI(image.uri))), image.uri);
  assert.match(readFileSync(sourceFile('license.txt'), 'utf8'), /CC-BY-4\.0/);
});

test('só o GLB otimizado e a licença são publicados (o original de ~9,4 MB fica fora do build)', () => {
  assert.ok(existsSync(publicFile(MODEL.otimizado)), 'GLB otimizado publicado');
  assert.match(readFileSync(publicFile('assets/models/xiaomi-scooter/license.txt'), 'utf8'), /CC-BY-4\.0/);
  assert.ok(existsSync(new URL(`../../${MODEL.poster.src}`, import.meta.url)), 'imagem de fallback');

  // Regressão: o scene.gltf/scene.bin/textures não podem voltar para public/, senão o dist volta a 12 MB.
  assert.equal(MODEL.original, undefined, 'MODEL.original foi removido de propósito');
  for (const file of ['scene.gltf', 'scene.bin', 'textures']) {
    assert.ok(!existsSync(publicFile(`assets/models/xiaomi-scooter/${file}`)), `${file} não deve estar em public/`);
  }
});
