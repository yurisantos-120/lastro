import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DashboardTicket } from '../services/tickets/dashboard.ts';
register('./helpers/tsx-loader.mjs', import.meta.url);
const { HandoffPanel, HandoffItems } =
  await import('../components/handoff-panel.tsx');
void test('dashboard handoff starts collapsed, non-modal and never blocks navigation', () => {
  const html = renderToStaticMarkup(
    createElement(HandoffPanel, {
      request: async () => {
        throw Error('no external fetch');
      },
      canConfirm: true,
    }),
  );
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /Consultar passagens/);
  assert.doesNotMatch(html, /<dialog|aria-modal|Confirmar recebimento/);
});
void test('handoff summary renders pending reason and optional orientation as escaped text', () => {
  const item: DashboardTicket = {
    id: 1,
    title: '<script>unsafe</script>',
    glpiTicketId: 101,
    resultState: 'created',
    glpiStatus: 2,
    state: 'pending',
    openedAt: '2026-10-22T12:00:00Z',
    lastSyncedAt: null,
    updatedAt: null,
    occurrenceType: 'Rompimento',
    routeDescription: 'Trecho',
    routeTitle: null,
    responsibleOrganization: 'Gerência',
    pendingReason: 'Acesso',
    lastObservation: 'Portaria avisada',
    guidance: 'Entrada lateral',
  };
  const html = renderToStaticMarkup(
    createElement(HandoffItems, { items: [item] }),
  );
  for (const text of [
    'Acesso',
    'Portaria avisada',
    'Entrada lateral',
    'Gerência',
  ])
    assert.ok(html.includes(text));
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});
void test('empty summary is explicit and does not create fictitious incidents', () => {
  assert.match(
    renderToStaticMarkup(createElement(HandoffItems, { items: [] })),
    /Nenhum chamado/,
  );
});
