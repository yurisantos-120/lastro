import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
register('./helpers/tsx-loader.mjs', import.meta.url);
const { FormField } = await import('../components/form-field.tsx');
const { TicketDashboard } = await import('../components/ticket-dashboard.tsx');

void test('operational control without name keeps its id and change handler contract', () => {
  const html = renderToStaticMarkup(createElement(FormField, { label: 'Observações' }, createElement('textarea', { id: 'operation-notes', defaultValue: 'Rascunho' })));
  assert.match(html, /for="operation-notes"/);
  assert.match(html, /<textarea[^>]*id="operation-notes"/);
  assert.match(html, /Rascunho/);
});
void test('known field error is linked without losing help or existing descriptions', () => {
  const html = renderToStaticMarkup(createElement(FormField, { label: 'Causa', error: 'Informe a causa', description: 'Necessária ao confirmar.' }, createElement('textarea', { id: 'cause', 'aria-describedby': 'original' })));
  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /aria-describedby="original cause-help cause-error"/);
  assert.match(html, /id="cause-error"/);
  assert.match(html, /role="alert"/);
});
void test('conditional requirement is announced without changing native submission validation', () => {
  const html = renderToStaticMarkup(createElement(FormField, { label: 'Causa', indication: 'required' }, createElement('textarea', { id: 'cause' })));
  assert.match(html, /Causa \(obrigatório\)/);
  assert.match(html, /aria-required="true"/);
  assert.doesNotMatch(html, /\srequired=""/);
});
void test('dashboard filters are discoverable and collapsed without removing grouping or handoff', () => {
  const html = renderToStaticMarkup(createElement(TicketDashboard, { request: async () => { throw Error('No external requests'); } }));
  assert.match(html, /<details[^>]*><summary[^>]*>Filtros de chamados/);
  assert.doesNotMatch(html, /<details[^>]*\sopen/);
  assert.match(html, /dashboard-state/);
  assert.match(html, /dashboard-group/);
  assert.match(html, /Passagem de turno/);
});

void test('required field keeps its existing identity and associates supplemental help', () => {
  const html = renderToStaticMarkup(createElement(FormField, { label: 'Categoria' },
    createElement('select', { id: 'category', name: 'categoryId', required: true, 'aria-describedby': 'existing-help' }),
    createElement('span', null, 'Crie uma categoria antes de cadastrar.')));
  assert.match(html, /for="category"/);
  assert.match(html, /Categoria \(obrigatório\)/);
  assert.match(html, /aria-describedby="existing-help category-help"/);
  assert.match(html, /id="category-help"/);
  assert.match(html, /name="categoryId"/);
});
void test('optional field has a stable accessible label without becoming required', () => {
  const html = renderToStaticMarkup(createElement(FormField, { label: 'Observações' }, createElement('textarea', { name: 'notes', defaultValue: 'Rascunho preservado' })));
  const id = /<textarea[^>]*id="([^"]+)"/.exec(html)?.[1];
  assert.ok(id);
  assert.ok(html.includes(`for="${id}"`));
  assert.match(html, /Observações \(opcional\)/);
  assert.ok(!html.includes('required='));
  assert.match(html, /Rascunho preservado/);
});
void test('select field preserves values and submission names while exposing required state', () => {
  const html = renderToStaticMarkup(createElement(FormField, { label: 'Rota' }, createElement('select', { name: 'routeId', defaultValue: '7', required: true }, createElement('option', { value: '7' }, 'Trecho cadastrado'))));
  assert.match(html, /name="routeId"/);
  assert.match(html, /required=""/);
  assert.match(html, /value="7" selected=""/);
});
