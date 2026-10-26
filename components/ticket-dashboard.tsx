'use client';
import { Alert, AlertStatus } from '@/components/ui/alert';
import { FormField } from '@/components/form-field';

import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import {
  Activity,
  CircleCheck,
  CirclePause,
  Ticket,
  RefreshCw,
  ArrowRight,
  Network,
} from 'lucide-react';
import { HandoffPanel } from '@/components/handoff-panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { dateBucket } from '@/services/tickets/dashboard';
import type {
  DashboardData,
  DashboardTicket,
} from '@/services/tickets/dashboard';
import { operationalStateLabels } from '@/services/tickets/operations';

type Group =
  | 'date'
  | 'state'
  | 'occurrence'
  | 'route'
  | 'organization'
  | 'glpi';
type RequestFn = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
const initialFilters = {
  state: '',
  from: '',
  to: '',
  occurrence: '',
  route: '',
  organization: '',
  glpiId: '',
};
const date = (value: string | null, zone: string) =>
  value
    ? new Date(value).toLocaleString('pt-BR', { timeZone: zone })
    : 'Não disponível';
const openingLabels: Record<string, string> = {
  created: 'Abertura confirmada',
  pending: 'Abertura em andamento',
  failed: 'Abertura rejeitada',
  uncertain: 'Abertura incerta',
};
const officialLabels: Record<number, string> = {
  1: 'Novo',
  2: 'Em atendimento',
  3: 'Planejado',
  4: 'Pendente',
  5: 'Solucionado',
  6: 'Fechado',
};

export function dashboardGroups(
  items: DashboardTicket[],
  group: Group,
  now: string,
  zone: string,
) {
  const groups = new Map<string, DashboardTicket[]>();
  for (const item of items) {
    const key =
      group === 'date'
        ? { today: 'Hoje', yesterday: 'Ontem', earlier: 'Dias anteriores' }[
            dateBucket(item.openedAt, now, zone)
          ]
        : group === 'glpi'
          ? item.glpiTicketId
            ? `GLPI #${item.glpiTicketId}`
            : 'Sem número GLPI'
          : group === 'state'
            ? item.state
              ? operationalStateLabels[item.state]
              : item.resultState === 'created' && item.glpiTicketId
                ? 'Sem acompanhamento'
                : 'Abertura não confirmada'
            : group === 'occurrence'
              ? item.occurrenceType || 'Tipo não informado'
              : group === 'route'
                ? item.routeDescription ||
                  item.routeTitle ||
                  'Trecho não informado'
                : item.responsibleOrganization ||
                  'Empresa / gerência não informada';
    const current = groups.get(key) ?? [];
    current.push(item);
    groups.set(key, current);
  }
  return [...groups];
}

export function DashboardResults({
  loading,
  error,
  data,
  group = 'date',
  onOpen,
}: {
  loading: boolean;
  error: string;
  data: DashboardData | null;
  group?: Group;
  onOpen?: (id: number) => void;
}) {
  if (loading)
    return (
      <AlertStatus variant="info" className="block rounded-xl border border-border bg-card p-6 text-card-foreground">
        Carregando dashboard operacional…
      </AlertStatus>
    );
  if (error)
    return (
      <Alert variant="error"
        
        className="rounded-xl border border-destructive p-4 text-foreground"
      >
        {error}
      </Alert>
    );
  if (!data) return null;
  const indicators = [
    ['Ativos', data.counts.active, Activity],
    ['Em tratamento', data.counts.in_progress, Network],
    ['Pendentes', data.counts.pending, CirclePause],
    ['Normalizados', data.counts.normalized, CircleCheck],
    ['Fechados', data.counts.closed, CircleCheck],
    ['Sem acompanhamento', data.counts.unstarted, Ticket],
  ] as const;
  return (
    <div className="space-y-4">
      {data.rfoAvailable === false && (
        <p className="text-sm text-muted-foreground">
          Consulta de RFO indisponível até preparar o banco. Os indicadores de
          chamados permanecem disponíveis.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {indicators.map(([label, count, Icon]) => (
          <div
            key={label}
            className="noc-stat-card rounded-xl border border-border bg-card p-4 text-card-foreground"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">{label}</span>
              <Icon aria-hidden="true" className="size-4 text-[#ef6427]" />
            </div>
            <strong className="mt-2 block text-2xl">{count}</strong>
          </div>
        ))}
      </div>
      <details className="rounded-lg border border-border/70 px-3 py-2 text-sm text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground focus-visible:outline-2 focus-visible:outline-ring">
          Como os indicadores são calculados
        </summary>
        <p className="mt-2">
          Indicadores dos filtros aplicados, em todas as páginas. Ativos reúne Em
          tratamento, Pendente e confirmados sem acompanhamento cujo último status
          GLPI não seja Fechado. Normalizados ficam separados.
        </p>
      </details>
      <p className="text-sm text-muted-foreground">
        {data.counts.confirmed} abertura(s) confirmada(s) ·{' '}
        {data.counts.unconfirmed} tentativa(s) sem confirmação, fora dos
        indicadores operacionais. Última sincronização GLPI neste resultado:{' '}
        {date(data.lastSyncedAt, data.timeZone)}. Atualizar o painel consulta
        apenas o banco local.
      </p>
      {data.items.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-card-foreground">
          <Ticket aria-hidden="true" className="mx-auto mb-3 size-6" />
          <p>Nenhum chamado encontrado para estes filtros.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Remova filtros ou escolha todas as situações. Não há limite
            automático por dia de abertura.
          </p>
        </div>
      ) : (
        dashboardGroups(data.items, group, data.generatedAt, data.timeZone).map(
          ([label, items]) => (
            <section key={label} aria-label={label} className="space-y-3">
              <h3 className="text-lg font-semibold">
                {label}{' '}
                <span className="text-sm font-normal text-muted-foreground">
                  ({items.length} nesta página)
                </span>
              </h3>
              <ul className="space-y-3">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="min-w-0 rounded-xl border border-border bg-card p-4 text-card-foreground"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">
                          {item.glpiTicketId
                            ? `GLPI #${item.glpiTicketId}`
                            : `Registro local #${item.id}`}
                        </p>
                        <h4 className="break-words font-semibold">
                          {item.title}
                        </h4>
                        {data.rfoAvailable !== false &&
                          item.resultState === 'created' &&
                          Boolean(item.glpiTicketId) && (
                            <p className="mt-1 text-sm font-medium">
                              {item.rfoStatus === 'pending'
                                ? 'RFO pendente'
                                : item.rfoStatus === 'completed'
                                  ? 'RFO concluída'
                                  : 'RFO não iniciada'}
                            </p>
                          )}
                      </div>
                      {onOpen && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => onOpen(item.id)}
                          aria-label={`Abrir detalhes do chamado ${item.glpiTicketId ? `GLPI #${item.glpiTicketId}` : `local #${item.id}`} — ${item.title}`}
                        >
                          Detalhes
                          <ArrowRight aria-hidden="true" className="size-4" />
                        </Button>
                      )}
                    </div>
                    <p className="mt-2 text-sm">
                      Situação local:{' '}
                      {item.state
                        ? operationalStateLabels[item.state]
                        : item.resultState === 'created' && item.glpiTicketId
                          ? 'Acompanhamento não iniciado'
                          : 'Abertura não confirmada'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {openingLabels[item.resultState] ??
                        'Resultado desconhecido'}{' '}
                      · Status oficial GLPI:{' '}
                      {item.glpiStatus === null
                        ? 'Não consultado'
                        : (officialLabels[item.glpiStatus] ??
                          `Status ${item.glpiStatus}`)}
                    </p>
                    <p className="mt-2 break-words text-sm text-muted-foreground">
                      {item.routeDescription || item.routeTitle || 'Trecho não informado'}
                    </p>
                    <details className="mt-3 rounded-lg border border-border/70 px-3 py-2 text-sm">
                      <summary className="cursor-pointer font-medium text-foreground focus-visible:outline-2 focus-visible:outline-ring">
                        Informações complementares
                      </summary>
                      <div className="mt-3 space-y-2 text-muted-foreground">
                        <p>
                          <b className="text-foreground">Tipo de ocorrência:</b>{' '}
                          {item.occurrenceType || 'Tipo não informado'}
                        </p>
                        <p>
                          <b className="text-foreground">Empresa / gerência:</b>{' '}
                          {item.responsibleOrganization || 'Não informada'}
                        </p>
                        {item.routeTitle && item.routeDescription && (
                          <p>Rota vinculada explicitamente: {item.routeTitle}</p>
                        )}
                        <p>Abertura registrada no Lastro: {date(item.openedAt, data.timeZone)}</p>
                        <p>Última movimentação: {date(item.updatedAt, data.timeZone)}</p>
                        <p>Última sincronização GLPI: {date(item.lastSyncedAt, data.timeZone)}</p>
                      </div>
                    </details>
                    {item.state === 'pending' && (
                      <div className="mt-3 space-y-2 rounded-lg border border-border p-3 text-sm">
                        <p className="whitespace-pre-wrap break-words">
                          <b>Motivo da pendência:</b> {item.pendingReason}
                        </p>
                        <p className="whitespace-pre-wrap break-words">
                          <b>Última observação:</b>{' '}
                          {item.lastObservation || 'Não registrada'}
                        </p>
                        {item.guidance && (
                          <p className="whitespace-pre-wrap break-words">
                            <b>Orientações:</b> {item.guidance}
                          </p>
                        )}
                      </div>
                    )}

                  </li>
                ))}
              </ul>
            </section>
          ),
        )
      )}
    </div>
  );
}

export function TicketDashboard({
  request,
  onOpen,
  refreshKey = 0,
  canConfirmHandoff = false,
  actorId,
}: {
  request: RequestFn;
  onOpen?: (id: number) => void;
  refreshKey?: number;
  canConfirmHandoff?: boolean;
  actorId?: number;
}) {
  const [filters, setFilters] = useState(initialFilters);
  const [applied, setApplied] = useState(initialFilters);
  const [group, setGroup] = useState<Group>('date');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState<{
    key: string;
    loading: boolean;
    data: DashboardData | null;
    error: string;
  }>({ key: '', loading: true, data: null, error: '' });
  const parameters = new URLSearchParams({
    ...applied,
    page: String(page),
    pageSize: String(pageSize),
  });
  const key = `${parameters.toString()}&refresh=${refresh}&external=${refreshKey}`;
  const resultHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setState({ key, loading: true, data: null, error: '' });
      try {
        const query = key.split('&refresh=')[0];
        const response = await request(`/api/tickets/dashboard?${query}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const body = (await response.json()) as DashboardData & {
          message?: string;
        };
        if (!response.ok)
          throw new Error(
            body.message || 'Não foi possível carregar o dashboard.',
          );
        if (!controller.signal.aborted)
          setState({ key, loading: false, data: body, error: '' });
      } catch (cause) {
        if (!controller.signal.aborted)
          setState({
            key,
            loading: false,
            data: null,
            error:
              cause instanceof Error
                ? cause.message
                : 'Falha ao consultar o dashboard.',
          });
      }
    }
    void load();
    return () => controller.abort();
  }, [request, key]);
  const loading = state.key !== key || state.loading;
  const apply = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setApplied({ ...filters });
    setPage(1);
    resultHeading.current?.focus();
  };
  const field = (
    name: keyof typeof initialFilters,
    label: string,
    type = 'text',
  ) => (
    <FormField key={name} className="space-y-1 text-sm" label={<>{label}</>} indication="auto"><Input
        id={`dashboard-${name}`}
        type={type}
        maxLength={name === 'route' ? 500 : 240}
        value={filters[name]}
        onChange={(event) =>
          setFilters({ ...filters, [name]: event.target.value })
        }
      />
    </FormField>
  );
  return (
    <section className="mb-7 space-y-5" aria-labelledby="noc-dashboard-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            id="noc-dashboard-title"
            ref={resultHeading}
            tabIndex={-1}
            className="text-xl font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Painel operacional do NOC
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Fuso do NOC: {state.data?.timeZone ?? 'carregando configuração'}.
            Agrupamento e datas usam este fuso.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={loading}
          onClick={() => setRefresh((value) => value + 1)}
        >
          <RefreshCw aria-hidden="true" className="size-4" />
          Atualizar painel
        </Button>
      </div>
      <details className="rounded-xl border border-border bg-card text-card-foreground">
        <summary className="cursor-pointer rounded-xl p-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">Filtros de chamados{Object.values(applied).some(Boolean) ? ' — há filtros aplicados' : ''}</summary>
      <form
        onSubmit={apply}
        className="grid gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground sm:grid-cols-2 xl:grid-cols-4"
      >
        <FormField className="space-y-1 text-sm" label={<>Situação</>} indication="none"><select
            id="dashboard-state"
            className="h-10 w-full rounded-md border border-input bg-background px-2"
            value={filters.state}
            onChange={(event) =>
              setFilters({ ...filters, state: event.target.value })
            }
          >
            <option value="">Todas as situações e tentativas</option>
            <option value="active">Ativos</option>
            {Object.entries(operationalStateLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
            <option value="unstarted">Sem acompanhamento</option>
            <option value="unconfirmed">Abertura não confirmada</option>
          </select>
        </FormField>
        {field('from', 'Abertura a partir de', 'date')}
        {field('to', 'Abertura até', 'date')}
        {field('occurrence', 'Tipo de ocorrência')}
        {field('route', 'Trecho / rota')}
        {field('organization', 'Empresa / gerência')}
        {field('glpiId', 'Número GLPI')}
        <div className="flex items-end gap-2">
          <Button type="submit">Aplicar filtros</Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const all = { ...initialFilters, state: '' };
              setFilters(all);
              setApplied(all);
              setPage(1);
            }}
          >
            Limpar
          </Button>
        </div>
      </form>
      </details>
      <div className="flex flex-wrap items-end gap-4">
        <FormField className="space-y-1 text-sm" label={<>Agrupar esta página por</>} indication="none"><select
            id="dashboard-group"
            className="block h-10 rounded-md border border-input bg-background px-2"
            value={group}
            onChange={(event) => setGroup(event.target.value as Group)}
          >
            <option value="date">Hoje, ontem e dias anteriores</option>
            <option value="state">Situação operacional</option>
            <option value="occurrence">Tipo de ocorrência</option>
            <option value="route">Trecho / rota</option>
            <option value="organization">Empresa / gerência</option>
            <option value="glpi">Número GLPI</option>
          </select>
        </FormField>
        <FormField className="space-y-1 text-sm" label={<>Por página</>} indication="none"><select
            id="dashboard-size"
            className="block h-10 rounded-md border border-input bg-background px-2"
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setPage(1);
            }}
          >
            <option>20</option>
            <option>50</option>
          </select>
        </FormField>
      </div>
      <div aria-busy={loading}>
        <DashboardResults
          loading={loading}
          error={state.error}
          data={state.data}
          group={group}
          onOpen={onOpen}
        />
      </div>
      {!loading && state.data && (
        <nav
          aria-label="Paginação de chamados"
          className="flex flex-wrap items-center gap-3"
        >
          <Button
            type="button"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            Anterior
          </Button>
          <output>
            Página {page} de {Math.max(1, state.data.totalPages)} ·{' '}
            {state.data.counts.total} registros
          </output>
          <Button
            type="button"
            variant="outline"
            disabled={page >= state.data.totalPages}
            onClick={() => setPage((value) => value + 1)}
          >
            Próxima
          </Button>
        </nav>
      )}
      <HandoffPanel
        request={request}
        canConfirm={canConfirmHandoff}
        actorId={actorId}
      />
    </section>
  );
}
