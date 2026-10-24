import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RfoRecord } from '../services/rfo/rfo.ts';
import type { LocalTicket } from '../services/tickets/types.ts';
import type {
  DashboardData,
  DashboardTicket,
} from '../services/tickets/dashboard.ts';
register('./helpers/tsx-loader.mjs', import.meta.url);
const { RfoContent, RfoPanel } = await import('../components/rfo-panel.tsx');
const { DashboardResults } = await import('../components/ticket-dashboard.tsx');
const rfo: RfoRecord = {
  ticketId: 1,
  glpiTicketId: 101,
  investigation: 'investigating',
  completion: 'pending',
  cause: '',
  technicalDescription: '<script>unsafe</script>',
  solution: '',
  responsibleTeam: 'Equipe A',
  notes: 'Observação',
  normalizedAt: null,
  createdAt: '2026-10-22T12:00:00Z',
  updatedAt: '2026-10-22T12:00:00Z',
  completedAt: null,
  updatedBy: 1,
  revision: 1,
};
void test('investigation and completion are distinct and RFO content is escaped', () => {
  const html = renderToStaticMarkup(createElement(RfoContent, { rfo }));
  assert.match(html, /Em análise/);
  assert.match(html, /RFO pendente/);
  assert.match(html, /Não informado/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});
void test('initial RFO view announces loading rather than fictitious empty or completed content', () => {
  const html = renderToStaticMarkup(
    createElement(RfoPanel, {
      ticket: { id: 1 } as LocalTicket,
      canEdit: true,
      request: async () => {
        throw Error('no external calls');
      },
    }),
  );
  assert.match(html, /Carregando RFO/);
  assert.doesNotMatch(html, /RFO ainda não iniciada|RFO concluída/);
});
void test('dashboard indicates pending RFO and shows unavailability without claiming an empty RFO', () => {
  const item: DashboardTicket = {
    id: 1,
    title: 'Ocorrência',
    glpiTicketId: 101,
    resultState: 'created',
    glpiStatus: 2,
    state: 'in_progress',
    openedAt: '2026-10-22T12:00:00Z',
    lastSyncedAt: null,
    updatedAt: null,
    occurrenceType: '',
    routeDescription: '',
    routeTitle: null,
    responsibleOrganization: '',
    pendingReason: '',
    lastObservation: '',
    guidance: '',
    rfoStatus: 'pending',
  };
  const data: DashboardData = {
    items: [item],
    counts: {
      total: 1,
      confirmed: 1,
      active: 1,
      in_progress: 1,
      pending: 0,
      normalized: 0,
      closed: 0,
      unstarted: 0,
      unconfirmed: 0,
    },
    page: 1,
    pageSize: 20,
    totalPages: 1,
    timeZone: 'America/Sao_Paulo',
    generatedAt: '2026-10-22T14:00:00Z',
    lastSyncedAt: null,
    rfoAvailable: true,
  };
  const html = renderToStaticMarkup(
    createElement(DashboardResults, { loading: false, error: '', data }),
  );
  assert.match(html, /RFO pendente/);
  const unavailable = renderToStaticMarkup(
    createElement(DashboardResults, {
      loading: false,
      error: '',
      data: { ...data, rfoAvailable: false },
    }),
  );
  assert.match(unavailable, /Consulta de RFO indisponível/);
  assert.doesNotMatch(unavailable, /RFO não iniciada/);
});
