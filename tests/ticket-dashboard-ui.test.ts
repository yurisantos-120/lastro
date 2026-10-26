import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type {
  DashboardData,
  DashboardTicket,
} from '../services/tickets/dashboard.ts';
register('./helpers/tsx-loader.mjs', import.meta.url);
const { DashboardResults, TicketDashboard, dashboardGroups } =
  await import('../components/ticket-dashboard.tsx');
const item: DashboardTicket = {
  id: 1,
  title: 'Fibra <script>alert(1)</script>',
  glpiTicketId: 1001,
  resultState: 'created',
  glpiStatus: 2,
  state: 'pending',
  openedAt: '2026-10-21T12:00:00Z',
  lastSyncedAt: null,
  updatedAt: '2026-10-22T12:00:00Z',
  occurrenceType: 'Rompimento',
  routeDescription: 'Trecho livre',
  routeTitle: null,
  responsibleOrganization: 'Gerência',
  pendingReason: 'Aguardando acesso',
  lastObservation: 'Portaria avisada',
  guidance: 'Entrada lateral',
};
const data: DashboardData = {
  items: [item],
  counts: {
    total: 1,
    confirmed: 1,
    active: 1,
    in_progress: 0,
    pending: 1,
    normalized: 0,
    closed: 0,
    unstarted: 0,
    unconfirmed: 0,
  },
  page: 1,
  pageSize: 20,
  totalPages: 1,
  timeZone: 'America/Sao_Paulo',
  generatedAt: '2026-10-22T16:00:00Z',
  lastSyncedAt: null,
};
void test('loading does not render zero counters or an empty-list message', () => {
  const html = renderToStaticMarkup(
    createElement(DashboardResults, { loading: true, error: '', data: null }),
  );
  assert.match(html, /Carregando dashboard/);
  assert.doesNotMatch(html, /Nenhum chamado|Pendentes/);
});
void test('API error is announced and cannot appear as an empty successful list', () => {
  const html = renderToStaticMarkup(
    createElement(DashboardResults, {
      loading: false,
      error: 'Banco indisponível',
      data: null,
    }),
  );
  assert.match(html, /role="alert"/);
  assert.match(html, /Banco indisponível/);
  assert.doesNotMatch(html, /Nenhum chamado/);
});
void test('empty list is explicit while counters and pagination totals stay independent', () => {
  const html = renderToStaticMarkup(
    createElement(DashboardResults, {
      loading: false,
      error: '',
      data: { ...data, items: [] },
    }),
  );
  assert.match(html, /Nenhum chamado encontrado/);
  assert.match(html, /Pendentes/);
});
void test('pending presentation preserves observations, official/local distinction, safe text and detail affordance', () => {
  const html = renderToStaticMarkup(
    createElement(DashboardResults, {
      loading: false,
      error: '',
      data,
      onOpen: () => {},
    }),
  );
  for (const value of [
    'Aguardando acesso',
    'Portaria avisada',
    'Entrada lateral',
    'Última movimentação',
    'Status oficial GLPI',
    'Situação local',
    'Ontem',
    'Abrir detalhes',
  ])
    assert.ok(html.includes(value));
  assert.match(html, /<summary[^>]*>Informações complementares<\/summary>/);
  assert.match(html, /Como os indicadores são calculados/);
  assert.match(html, /Motivo da pendência/);
  assert.match(html, /Rompimento/);
  assert.match(html, /Abertura registrada no Lastro/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});
void test('grouping by date, state, type, route and organization retains each row once', () => {
  const items = [
    item,
    { ...item, id: 2, openedAt: '2026-10-22T12:00:00Z' },
    { ...item, id: 3, openedAt: '2025-01-01T12:00:00Z' },
  ];
  const dates = dashboardGroups(items, 'date', data.generatedAt, data.timeZone);
  assert.deepEqual(
    new Set(dates.map(([key]) => key)),
    new Set(['Hoje', 'Ontem', 'Dias anteriores']),
  );
  for (const group of [
    'date',
    'state',
    'occurrence',
    'route',
    'organization',
    'glpi',
  ] as const)
    assert.equal(
      dashboardGroups(items, group, data.generatedAt, data.timeZone).flatMap(
        ([, rows]) => rows,
      ).length,
      3,
    );
});
void test('initial component includes accessible filters, loading state and reserved shift notice without external fetch', () => {
  const html = renderToStaticMarkup(
    createElement(TicketDashboard, {
      request: async () => {
        throw Error('must not fetch during render');
      },
    }),
  );
  assert.match(html, /Carregando dashboard/);
  assert.match(html, /passagem de turno/i);
  for (const id of [
    'state',
    'from',
    'to',
    'occurrence',
    'route',
    'organization',
    'glpiId',
    'group',
    'size',
  ])
    assert.ok(html.includes(`id="dashboard-${id}"`));
});
