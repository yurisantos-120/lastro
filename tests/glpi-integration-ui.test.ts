import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LocalTicket } from '../services/tickets/types.ts';
import type { IntegrationOperation } from '../services/glpi/integration.ts';
register('./helpers/tsx-loader.mjs', import.meta.url);
const { IntegrationHistory, GlpiIntegrationPanel } =
  await import('../components/glpi-integration-panel.tsx');
const ticket = {
  id: 1,
  title: 'Ocorrência',
  glpiTicketId: 101,
  resultState: 'created',
  status: 5,
  lastSyncedAt: null,
} as LocalTicket;
void test('integration exposes loading, API errors and empty history without claiming remote confirmation', () => {
  const loading = renderToStaticMarkup(
    createElement(IntegrationHistory, { data: null, loading: true, error: '' }),
  );
  assert.match(loading, /<output/);
  assert.match(loading, /Carregando integração/);
  assert.doesNotMatch(loading, /Confirmado/);
  const error = renderToStaticMarkup(
    createElement(IntegrationHistory, {
      data: null,
      loading: false,
      error: 'Integração indisponível',
    }),
  );
  assert.match(error, /role="alert"/);
  const empty = renderToStaticMarkup(
    createElement(IntegrationHistory, {
      data: {
        ticket,
        operations: [],
        events: [],
        active: null,
        divergence: null,
        page: 1,
      },
      loading: false,
      error: '',
    }),
  );
  assert.match(empty, /Nenhuma operação/);
  assert.match(empty, /Ainda não realizada/);
});
void test('uncertain writes, solution identity, divergence and operator history are distinct and escaped', () => {
  const operation = {
    id: 'key',
    ticketId: 1,
    action: 'solution',
    state: 'uncertain',
    remoteId: 101,
    solutionId: 501,
    updatedAt: '2026-10-22T12:00:00Z',
    code: 'RECONCILIATION_REQUIRED',
  } as IntegrationOperation;
  const html = renderToStaticMarkup(
    createElement(IntegrationHistory, {
      loading: false,
      error: '',
      data: {
        ticket,
        operations: [operation],
        active: operation,
        page: 1,
        divergence: 'Revisão manual necessária',
        events: [
          {
            id: 1,
            operationId: 'key',
            actorId: 1,
            actorName: '<script>op</script>',
            recordedAt: '2026-10-22T12:00:00Z',
            snapshotJson: JSON.stringify({
              action: 'solution',
              state: 'uncertain',
              code: 'RECONCILIATION_REQUIRED',
              observation: { remoteStatus: 5 },
            }),
          },
        ],
      },
    }),
  );
  assert.match(html, /Resultado incerto/);
  assert.match(html, /Solução GLPI #501/);
  assert.match(html, /Status oficial 5/);
  assert.match(html, /Revisão manual/);
  assert.doesNotMatch(html, /<script>|Confirmado por consulta remota/);
  assert.match(html, /&lt;script&gt;/);
});
void test('initial panel preserves local navigation, offers local history and never sends GLPI requests during render', () => {
  let calls = 0;
  const html = renderToStaticMarkup(
    createElement(GlpiIntegrationPanel, {
      ticket,
      admin: false,
      request: async () => {
        calls++;
        throw Error('no network');
      },
      onUpdated: () => {},
    }),
  );
  assert.equal(calls, 0);
  assert.match(html, /Consultar histórico local/);
  assert.match(html, /Carregando integração/);
  assert.match(html, /Nenhuma ação altera automaticamente/);
  assert.doesNotMatch(html, /role="dialog"/);
});
