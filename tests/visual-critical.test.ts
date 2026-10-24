import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormSubmissionError, SubmissionGate } from '../lib/form-submission.ts';

register('./helpers/tsx-loader.mjs', import.meta.url);
const { Alert } = await import('../components/ui/alert.tsx');
const { CollectionState } = await import('../components/collection-state.tsx');

void test('submission gate prevents concurrent sends before pending is rendered', async () => {
  const gate = new SubmissionGate();
  let calls = 0, release!: () => void;
  const first = gate.run(async () => { calls++; await new Promise<void>((r) => { release = r; }); });
  assert.equal((await gate.run(async () => { calls++; })).state, 'ignored');
  assert.equal(calls, 1);
  release();
  assert.equal((await first).state, 'saved');
});

void test('known validation failures allow a corrected retry without a reset', async () => {
  const gate = new SubmissionGate();
  const rejected = await gate.run(async () => { throw new FormSubmissionError('Corrija o campo', 400); });
  assert.equal(rejected.state, 'error');
  assert.equal(gate.uncertain, false);
  assert.equal((await gate.run(async () => {})).state, 'saved');
});

void test('unknown create outcomes and unexpected failures never replay automatically', async () => {
  for (const error of [new FormSubmissionError('Resultado incerto', 503, true), new TypeError('Network failure')]) {
    const gate = new SubmissionGate();
    let calls = 0;
    await gate.run(async () => { calls++; throw error; });
    assert.equal(gate.uncertain, true);
    assert.equal((await gate.run(async () => { calls++; })).state, 'ignored');
    assert.equal(calls, 1);
  }
});

void test('revision-protected edit failures can retry and conflicts retain their status', async () => {
  const gate = new SubmissionGate();
  const conflict = new FormSubmissionError('Versão alterada', 409);
  const result = await gate.run(async () => { throw conflict; });
  assert.equal(result.state, 'error');
  if (result.state === 'error') assert.equal(result.error, conflict);
  assert.equal((await gate.run(async () => {})).state, 'saved');
});

void test('collections never render empty/results while loading or after a failed read', () => {
  for (const state of [{ loading: true, error: '' }, { loading: false, error: 'Falha de leitura' }]) {
    const html = renderToStaticMarkup(createElement(CollectionState, { ...state, retry() {}, empty: true }, 'RESULTADOS'));
    assert.ok(!html.includes('RESULTADOS'));
    assert.ok(!html.includes('Nenhum cadastro encontrado'));
    assert.match(html, state.loading ? /Carregando cadastros/ : /Falha de leitura/);
  }
  const empty = renderToStaticMarkup(createElement(CollectionState, { loading: false, error: '', retry() {}, empty: true }, 'RESULTADOS'));
  assert.match(empty, /Nenhum cadastro encontrado/);
});

void test('semantic feedback exposes error/status without relying on its color', () => {
  for (const variant of ['error', 'warning', 'success', 'info'] as const) {
    const html = renderToStaticMarkup(createElement(Alert, { variant }, 'Mensagem explícita'));
    assert.ok(html.includes(`lastro-feedback-${variant}`));
    assert.ok(html.includes('Mensagem explícita'));
    assert.match(html, /role="(alert|status)"/);
  }
});
