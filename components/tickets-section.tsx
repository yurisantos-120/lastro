'use client';

import { useCallback, useEffect, useRef, useState, type SubmitEvent } from 'react';
import { AlertTriangle, ArrowLeft, FileText, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertStatus } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/form-field';
import { Textarea } from '@/components/ui/textarea';
import { GlpiTestPanel } from '@/components/glpi-test-panel';
import { TicketDashboard } from '@/components/ticket-dashboard';
import { RfoPanel } from '@/components/rfo-panel';
import { GlpiIntegrationPanel } from '@/components/glpi-integration-panel';
import { createOperationId } from '@/lib/operation-id';
import { TicketOperationsPanel } from '@/components/ticket-operations-panel';
import type {
  LocalTicket,
  TicketCreateApiResponse,
  TicketDetailApiResponse,
} from '@/services/tickets/types';

type TicketView = 'overview' | 'open' | 'templates' | 'detail';
type Notice = { resultState: 'created' | 'failed' | 'uncertain' | 'pending'; message: string; code?: string };

function resultLabel(state: LocalTicket['resultState']) {
  return {
    created: 'Criado no GLPI',
    failed: 'Falha confirmada',
    pending: 'Em andamento',
    uncertain: 'Resultado incerto',
  }[state];
}

function glpiStatus(status: number | null) {
  if (status === null) return 'Ainda não consultado';
  return ({ 1: 'Novo', 2: 'Em atendimento', 3: 'Planejado', 4: 'Pendente', 5: 'Solucionado', 6: 'Fechado' } as Record<number, string>)[status]
    ?? `Status GLPI ${status}`;
}

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('pt-BR');
}

type TicketsSectionProps = {
  actorId?: number;
  initialTicketId?: number | null;
  canCreate: boolean;
  canViewDetails: boolean;
  showGlpiTest: boolean;
  request: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

export function TicketsSection({ actorId, initialTicketId, canCreate, canViewDetails, showGlpiTest, request }: TicketsSectionProps) {
  const [view, setView] = useState<TicketView>('overview');
  const [dashboardRefresh, setDashboardRefresh] = useState(0);
  const [pending, setPending] = useState(false);
  const [operationKey, setOperationKey] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [selected, setSelected] = useState<LocalTicket | null>(null);
  const [syncMessage, setSyncMessage] = useState('');
  const [createdTicket, setCreatedTicket] = useState<LocalTicket | null>(null);

  const selectionSequence = useRef(0);
  const openLocalDetails = useCallback(async (id: number, signal?: AbortSignal) => {
    if (!canViewDetails) return;
    const sequence = ++selectionSequence.current;
    setPending(true);
    setSyncMessage('');
    try {
      const response = await request('/api/tickets/' + id, { cache: 'no-store', signal });
      const body = await response.json() as { ticket?: LocalTicket; message?: string };
      if (!response.ok || !body.ticket) throw new Error(body.message || 'Falha ao consultar detalhes locais.');
      if (signal?.aborted || sequence !== selectionSequence.current) return;
      setSelected(body.ticket); setView('detail');
      setSyncMessage('Dados locais. Nenhuma consulta ao GLPI foi realizada.');
    } catch (cause) {
      if (!signal?.aborted && sequence === selectionSequence.current) setSyncMessage(cause instanceof Error ? cause.message : 'Falha ao consultar detalhes locais.');
    } finally { if (!signal?.aborted && sequence === selectionSequence.current) setPending(false); }
  }, [canViewDetails, request]);
  useEffect(() => {
    if (!initialTicketId) return;
    const controller = new AbortController();
    void Promise.resolve().then(() => { if (!controller.signal.aborted) return openLocalDetails(initialTicketId, controller.signal); });
    return () => controller.abort();
  }, [initialTicketId, openLocalDetails]);
  function refreshHistory() { setDashboardRefresh((value) => value + 1); setView('overview'); }

  function beginOpen() {
    if (!canCreate) return;
    selectionSequence.current += 1;
    setPending(false);
    setTitle('');
    setCreatedTicket(null);
    setContent('');
    setNotice(null);
    setOperationKey(createOperationId());
    setView('open');
  }

  async function createTicket(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate || pending || !operationKey) return;
    setPending(true);
    setNotice(null);
    try {
      const response = await request('/api/glpi/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationKey, title, content }),
      });
      const data = (await response.json()) as TicketCreateApiResponse;
      if (response.ok && data.success) {
        setCreatedTicket(data.ticket);
        setNotice({ resultState: 'created', message: data.reused ? 'Esta solicitação já havia sido registrada.' : 'Chamado criado e registrado no histórico.' });
      } else {
        setNotice({
          resultState: data.success ? 'created' : data.resultState ?? 'uncertain',
          message: 'message' in data && data.message
            ? data.message
            : 'Não foi possível confirmar o resultado. Atualize o histórico antes de tentar novamente.',
          code: 'code' in data ? data.code : undefined,
        });
      }
      setDashboardRefresh((value) => value + 1);
    } catch {
      setNotice({
        resultState: 'uncertain',
        message: 'Não foi possível confirmar o resultado. Atualize o histórico e verifique no GLPI antes de tentar novamente.',
      });
      setDashboardRefresh((value) => value + 1);
    } finally {
      setPending(false);
    }
  }

  async function openDetails(ticket: LocalTicket) { await openLocalDetails(ticket.id); }

  async function refreshTicket(glpiId: number) {
    const sequence = ++selectionSequence.current;
    setPending(true);
    setSyncMessage('Consultando o GLPI…');
    try {
      const response = await request(`/api/glpi/tickets/${glpiId}`, { cache: 'no-store' });
      const data = (await response.json()) as TicketDetailApiResponse | { message?: string };
      if (sequence !== selectionSequence.current) return;
      if (!response.ok || !('ticket' in data)) {
        setSyncMessage(('message' in data && data.message) || 'Falha ao atualizar os dados do GLPI.');
        return;
      }
      setSelected(data.ticket);

      setSyncMessage(data.sync.success
        ? `Atualizado agora. Última sincronização: ${formatDate(data.ticket.lastSyncedAt)}`
        : `${data.sync.message} Exibindo o último registro local conhecido.`);
    } catch {
      if (sequence !== selectionSequence.current) return;
      setSyncMessage('Falha ao consultar o GLPI. Exibindo o último registro local conhecido.');
    } finally {
      if (sequence === selectionSequence.current) setPending(false);
    }
  }

  if (view === 'templates') {
    if (!canCreate) return null;
    return <section className="space-y-5" aria-labelledby="ticket-placeholder-title">
      <Button variant="outline" onClick={() => setView('overview')}><ArrowLeft className="size-4" />Voltar para Chamados</Button>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 id="ticket-placeholder-title" className="text-xl font-semibold">Modelos de chamado</h2>
        <p className="mt-3 text-sm text-slate-500">Os modelos de chamado serão configurados aqui.</p>
        <p className="mt-2 text-sm text-slate-500">Abertura por modelo, rota e campos dinâmicos fica para uma etapa posterior.</p>
      </div>
    </section>;
  }

  if (view === 'open') {
    if (!canCreate) return null;
    return <section className="space-y-5" aria-labelledby="open-ticket-title">
      <Button variant="outline" onClick={() => setView('overview')}><ArrowLeft className="size-4" />Voltar para Chamados</Button>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 id="open-ticket-title" className="text-xl font-semibold">Abrir chamado</h2>
        <p className="mt-2 text-sm text-slate-500">O envio será feito pelo backend do Lastro ao GLPI configurado.</p>
        {notice?.resultState === 'pending' && <output className="mt-5 block rounded-xl border border-border p-4 text-sm">{notice.message}</output>}
        {notice?.resultState === 'uncertain' && <Alert variant="warning" className="mt-5 flex gap-3 p-4"><AlertTriangle className="size-5 shrink-0" /><div><p className="font-semibold">Resultado incerto</p><p className="mt-1">{notice.message}</p>{notice.code && <p className="mt-1 text-xs">Código: {notice.code}</p>}</div></Alert>}
        {notice?.resultState === 'failed' && <Alert variant="error" className="mt-5 p-4"><p className="font-semibold">Abertura não confirmada</p><p className="mt-1">{notice.message}</p>{notice.code && <p className="mt-1 text-xs">Código: {notice.code}</p>}</Alert>}
        {notice?.resultState === 'created' && <AlertStatus variant="success" className="mt-5 p-4">{notice.message}</AlertStatus>}
        <form onSubmit={(event) => void createTicket(event)} className="mt-5 space-y-4">
          <FormField label="Título"><Input id="ticket-title" required maxLength={255} value={title} disabled={pending || notice?.resultState === 'uncertain' || notice?.resultState === 'created'} onChange={(event) => setTitle(event.target.value)} /></FormField>
          <FormField label="Descrição"><Textarea id="ticket-content" required maxLength={10000} rows={7} value={content} disabled={pending || notice?.resultState === 'uncertain' || notice?.resultState === 'created'} onChange={(event) => setContent(event.target.value)} /></FormField>
          <div className="flex flex-wrap gap-2">
            {!notice && <Button type="submit" disabled={pending || !title.trim() || !content.trim()} variant="brand">{pending ? 'Enviando…' : 'Criar chamado'}</Button>}
            {notice?.resultState === 'failed' && <Button type="button" variant="outline" onClick={() => { setOperationKey(createOperationId()); setNotice(null); }}>Iniciar nova tentativa</Button>}
            {notice?.resultState === 'uncertain' && <Button type="button" variant="outline" disabled={pending} onClick={refreshHistory}><RefreshCw className="size-4" />Atualizar histórico</Button>}
            {notice?.resultState === 'created' && <Button type="button" onClick={beginOpen} variant="brand">Abrir outro chamado</Button>}
            {notice?.resultState === 'created' && createdTicket && <Button type="button" variant="outline" onClick={() => void openDetails(createdTicket)}>Preencher acompanhamento operacional</Button>}
            <Button type="button" variant="outline" onClick={() => setView('overview')}>Cancelar</Button>
          </div>
        </form>
      </div>
    </section>;
  }

  if (view === 'detail' && selected) {
    return <section className="space-y-5" aria-labelledby="ticket-detail-title">
      <Button variant="outline" onClick={() => setView('overview')}><ArrowLeft className="size-4" />Voltar para Chamados</Button>
      <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{selected.glpiTicketId ? `GLPI #${selected.glpiTicketId}` : 'Sem ID GLPI confirmado'}</p><h2 id="ticket-detail-title" className="mt-1 text-xl font-semibold">{selected.title}</h2></div>{selected.glpiTicketId && <Button type="button" variant="outline" disabled={pending} onClick={() => void refreshTicket(selected.glpiTicketId!)}><RefreshCw className="size-4" />{pending ? 'Atualizando…' : 'Atualizar status'}</Button>}</div>
        <p className="mt-4 text-sm text-slate-600">Resultado: {resultLabel(selected.resultState)}</p>
        <p className="mt-1 text-sm text-slate-600">Status GLPI: {glpiStatus(selected.status)}</p>
        <p className="mt-1 text-sm text-slate-600">Criado no Lastro: {formatDate(selected.createdAt)}</p>
        <p className="mt-1 text-sm text-slate-600">Criado no GLPI: {formatDate(selected.glpiCreatedAt)}</p>
        <p className="mt-1 text-sm text-slate-600">Última sincronização: {formatDate(selected.lastSyncedAt)}</p>
        {selected.createdBy === null ? <p className="mt-1 text-sm text-slate-600">Autoria: Não disponível</p> : null}
        {syncMessage && <output className="mt-4 block rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{syncMessage}</output>}
        {selected.failureCode && <p className="mt-2 text-xs text-slate-500">Código: {selected.failureCode}</p>}
        <h3 className="mt-6 text-sm font-semibold">Descrição</h3><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{selected.content}</p>
      </article>
      <GlpiIntegrationPanel key={`glpi-${selected.id}`} ticket={selected} request={request} admin={showGlpiTest} onUpdated={setSelected} />
      <TicketOperationsPanel key={selected.id} ticket={selected} request={request} />
      <RfoPanel key={`rfo-${selected.id}`} ticket={selected} request={request} canEdit={canCreate} />
    </section>;
  }

  return <div className="space-y-5">
    <div className="flex flex-wrap gap-2">
      {canCreate && <Button onClick={beginOpen} variant="brand"><Plus className="size-4" />Abrir chamado</Button>}
      {canCreate && <Button variant="outline" onClick={() => setView('templates')}><FileText className="size-4" />Modelos de chamado (em breve)</Button>}
    </div>
    {syncMessage && <Alert variant="error"  className="rounded-lg border border-border p-3 text-sm">{syncMessage}</Alert>}
    {pending && <AlertStatus variant="info" className="block">Carregando detalhes locais…</AlertStatus>}
    <TicketDashboard request={request} canConfirmHandoff={canCreate} actorId={actorId} refreshKey={dashboardRefresh} onOpen={canViewDetails ? (id) => { void openLocalDetails(id); } : undefined} />
    {showGlpiTest && <GlpiTestPanel request={request} />}
  </div>;
}
