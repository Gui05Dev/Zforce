import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDiagnosticMode, getSceneConfig, isLowPower } from '../../js/modules/env.js';

test('diagnóstico: 3D com WebGL (mesmo com movimento reduzido); imagem sem WebGL, com economia de dados ou aparelho fraco', () => {
  assert.equal(getDiagnosticMode({ webgl: true, saveData: false, lowPower: false }), '3d');
  assert.equal(getDiagnosticMode({ webgl: false, saveData: false, lowPower: false }), 'imagem');
  assert.equal(getDiagnosticMode({ webgl: true, saveData: true, lowPower: true }), 'imagem');
  assert.equal(getDiagnosticMode({ webgl: true, saveData: false, lowPower: true }), 'imagem');
});

const base = { touchOnly: false, lowPower: false, reducedMotion: false, webgl: true };

test('sem cena 3D com movimento reduzido, aparelho fraco ou sem WebGL', () => {
  assert.equal(getSceneConfig({ ...base, reducedMotion: true }), null);
  assert.equal(getSceneConfig({ ...base, lowPower: true }), null);
  assert.equal(getSceneConfig({ ...base, webgl: false }), null);
});

test('aparelho de toque recebe cena simplificada, não uma cópia reduzida do desktop', () => {
  const desktop = getSceneConfig(base);
  const toque = getSceneConfig({ ...base, touchOnly: true });
  assert.ok(toque.particles < desktop.particles / 2);
  assert.ok(toque.nodes < desktop.nodes);
  assert.ok(toque.maxDpr <= 1.25);
  assert.equal(toque.fps, 30);
  assert.equal(toque.pointer, false);
  // Modelo 3D só onde há mouse: no celular e no tablet o desenho SVG continua.
  assert.equal(toque.scooter, false);
  assert.equal(desktop.scooter, true);
});

test('janela estreita no desktop continua sendo desktop (é o aparelho que decide, não a largura)', () => {
  // Foi o caso que motivou a mudança: maximizada dava o 3D, restaurada ficava no desenho.
  const janelaEstreita = getSceneConfig({ ...base, mobile: true });
  assert.equal(janelaEstreita.scooter, true, 'o patinete 3D entra mesmo com a janela pequena');
  assert.equal(janelaEstreita.fps, 60, 'sem queda de fluidez: menos pixels, mesma GPU');
  assert.deepEqual(janelaEstreita, getSceneConfig(base));
});

test('devicePixelRatio sempre limitado', () => {
  assert.ok(getSceneConfig(base).maxDpr <= 1.5);
});

test('detecção de baixo desempenho', () => {
  assert.equal(isLowPower({ saveData: true }), true);
  assert.equal(isLowPower({ deviceMemory: 2 }), true);
  assert.equal(isLowPower({ hardwareConcurrency: 2 }), true);
  assert.equal(isLowPower({ deviceMemory: 8, hardwareConcurrency: 8 }), false);
  assert.equal(isLowPower(), false);
});
