import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDiagnosticMode, getSceneConfig, isLowPower } from '../../js/modules/env.js';

test('diagnóstico: 3D com WebGL (mesmo com movimento reduzido); imagem sem WebGL, com economia de dados ou aparelho fraco', () => {
  assert.equal(getDiagnosticMode({ webgl: true, saveData: false, lowPower: false }), '3d');
  assert.equal(getDiagnosticMode({ webgl: false, saveData: false, lowPower: false }), 'imagem');
  assert.equal(getDiagnosticMode({ webgl: true, saveData: true, lowPower: true }), 'imagem');
  assert.equal(getDiagnosticMode({ webgl: true, saveData: false, lowPower: true }), 'imagem');
});

const base = { mobile: false, lowPower: false, reducedMotion: false, webgl: true };

test('sem cena 3D com movimento reduzido, aparelho fraco ou sem WebGL', () => {
  assert.equal(getSceneConfig({ ...base, reducedMotion: true }), null);
  assert.equal(getSceneConfig({ ...base, lowPower: true }), null);
  assert.equal(getSceneConfig({ ...base, webgl: false }), null);
});

test('celular recebe cena simplificada, não uma cópia reduzida do desktop', () => {
  const desktop = getSceneConfig(base);
  const mobile = getSceneConfig({ ...base, mobile: true });
  assert.ok(mobile.particles < desktop.particles / 2);
  assert.ok(mobile.nodes < desktop.nodes);
  assert.ok(mobile.maxDpr <= 1.25);
  assert.equal(mobile.fps, 30);
  assert.equal(mobile.pointer, false);
  // Modelo 3D só no desktop: no celular o desenho SVG continua.
  assert.equal(mobile.scooter, false);
  assert.equal(desktop.scooter, true);
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
