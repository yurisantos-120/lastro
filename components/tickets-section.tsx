'use client';

import { useCallback, useEffect, useState, type SubmitEvent } from 'react';
import { AlertTriangle, ArrowLeft, FileText, Plus, RefreshCw, Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { GlpiTestPanel } from '@/components/glpi-test-panel';
import { createOperationId } from '@/lib/operation-id';
import type {
  LocalTicket,
  TicketCreateApiResponse,
  TicketDetailApiResponse,
  TicketListApiResponse,
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
  canCreate: boolean;
  canViewDetails: boolean;
  showGlpiTest: boolean;
  request: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

export function TicketsSection({ canCreate, canViewDetails, showGlpiTest, request }: TicketsSectionProps) {
  const [view, setView] = useState<TicketView>('overview');
  const [tickets, setTickets] = useState<LocalTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [pending, setPending] = useState(false);
  const [operationKey, setOperationKey] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [selected, setSelected] = useState<LocalTicket | null>(null);
  const [syncMessage, setSyncMessage] = useState('');

  const loadTickets = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await request('/api/glpi/tickets', { cache: 'no-store', signal });
      const data = (await response.json()) as TicketListApiResponse | { message?: string };
      if (!response.ok || !('tickets' in data) || !Array.isArray(data.tickets)) {
        throw new Error('Não foi possível carregar o histórico local.');
      }
      setTickets(data.tickets);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setLoadError(error instanceof Error ? error.message : 'Falha ao carregar chamados.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [request]);

  function refreshHistory() {
    setLoading(true);
    setLoadError('');
    void loadTickets();
  }

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => loadTickets(controller.signal));
    return () => controller.abort();
  }, [loadTickets]);

  function beginOpen() {
    if (!canCreate) return;
    setTitle('');
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
      const createdTicket = data.ticket;
      if (createdTicket) {
        setTickets((current) => [createdTicket, ...current.filter((item) => item.id !== createdTicket.id)]);
      }
      if (response.ok && data.success) {
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
      await loadTickets();
    } catch {
      setNotice({
        resultState: 'uncertain',
        message: 'Não foi possível confirmar o resultado. Atualize o histórico e verifique no GLPI antes de tentar novamente.',
      });
      await loadTickets();
    } finally {
      setPending(false);
    }
  }

  async function openDetails(ticket: LocalTicket) {
    if (!canViewDetails) return;
    setSelected(ticket);
    setSyncMessage('Consultando o GLPI…');
    setView('detail');
    if (!ticket.glpiTicketId) {
      setSyncMessage(ticket.resultState === 'uncertain'
        ? 'Verifique no GLPI antes de iniciar uma nova tentativa. O sistema não repetirá esse envio automaticamente.'
        : 'Esta tentativa não possui um ID GLPI confirmado.');
      return;
    }
    await refreshTicket(ticket.glpiTicketId);
  }

  async function refreshTicket(glpiId: number) {
    setPending(true);
    setSyncMessage('Consultando o GLPI…');
    try {
      const response = await request(`/api/glpi/tickets/${glpiId}`, { cache: 'no-store' });
      const data = (await response.json()) as TicketDetailApiResponse | { message?: string };
      if (!response.ok || !('ticket' in data)) {
        setSyncMessage(('message' in data && data.message) || 'Falha ao atualizar os dados do GLPI.');
        return;
      }
      setSelected(data.ticket);
      setTickets((current) => current.map((item) => item.id === data.ticket.id ? data.ticket : item));
      setSyncMessage(data.sync.success
        ? `Atualizado agora. Última sincronização: ${formatDate(data.ticket.lastSyncedAt)}`
        : `${data.sync.message} Exibindo o último registro local conhecido.`);
    } catch {
      setSyncMessage('Falha ao consultar o GLPI. Exibindo o último registro local conhecido.');
    } finally {
      setPending(false);
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
        {notice?.resultState === 'uncertain' && <div role="alert" className="mt-5 flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle className="size-5 shrink-0" /><div><p className="font-semibold">Resultado incerto</p><p className="mt-1">{notice.message}</p>{notice.code && <p className="mt-1 text-xs">Código: {notice.code}</p>}</div></div>}
        {notice?.resultState === 'failed' && <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p className="font-semibold">Abertura não confirmada</p><p className="mt-1">{notice.message}</p>{notice.code && <p className="mt-1 text-xs">Código: {notice.code}</p>}</div>}
        {notice?.resultState === 'created' && <output className="mt-5 block rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice.message}</output>}
        <form onSubmit={(event) => void createTicket(event)} className="mt-5 space-y-4">
          <div><label htmlFor="ticket-title" className="mb-1 block text-sm font-medium">Título</label><Input id="ticket-title" required maxLength={255} value={title} disabled={pending || notice?.resultState === 'uncertain' || notice?.resultState === 'created'} onChange={(event) => setTitle(event.target.value)} /></div>
          <div><label htmlFor="ticket-content" className="mb-1 block text-sm font-medium">Descrição</label><Textarea id="ticket-content" required maxLength={10000} rows={7} value={content} disabled={pending || notice?.resultState === 'uncertain' || notice?.resultState === 'created'} onChange={(event) => setContent(event.target.value)} /></div>
          <div className="flex flex-wrap gap-2">
            {notice?.resultState !== 'created' && notice?.resultState !== 'uncertain' && <Button type="submit" disabled={pending || !title.trim() || !content.trim()} className="bg-[#ff6b2c] text-white hover:bg-[#e85b20]">{pending ? 'Enviando…' : 'Criar chamado'}</Button>}
            {notice?.resultState === 'failed' && <Button type="button" variant="outline" onClick={() => { setOperationKey(createOperationId()); setNotice(null); }}>Iniciar nova tentativa</Button>}
            {notice?.resultState === 'uncertain' && <Button type="button" variant="outline" disabled={loading} onClick={refreshHistory}><RefreshCw className="size-4" />Atualizar histórico</Button>}
            {notice?.resultState === 'created' && <Button type="button" onClick={beginOpen} className="bg-[#ff6b2c] text-white hover:bg-[#e85b20]">Abrir outro chamado</Button>}
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
    </section>;
  }

  return <div className="space-y-5">
    <div className="flex flex-wrap gap-2">
      {canCreate && <Button onClick={beginOpen} className="bg-[#ff6b2c] text-white hover:bg-[#e85b20]"><Plus className="size-4" />Abrir chamado</Button>}
      {canCreate && <Button variant="outline" onClick={() => setView('templates')}><FileText className="size-4" />Modelos de chamado</Button>}
      <Button variant="outline" disabled={loading} onClick={refreshHistory}><RefreshCw className="size-4" />Atualizar histórico</Button>
    </div>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-labelledby="recent-tickets-title">
      <div className="border-b border-slate-100 px-5 py-4"><h2 id="recent-tickets-title" className="font-semibold">Últimos chamados</h2></div>
      {loadError && <p role="alert" className="m-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{loadError}</p>}
      {loading ? <p className="px-5 py-10 text-center text-sm text-slate-500">Carregando histórico…</p> : tickets.length === 0 ? <div className="px-5 py-12 text-center"><Ticket className="mx-auto mb-3 size-8 text-slate-400" aria-hidden="true" /><p className="text-sm font-medium">Nenhum chamado registrado ainda.</p><p className="mt-2 text-xs text-slate-500">Os chamados enviados pelo Lastro aparecerão aqui.</p></div> : <ul className="divide-y divide-slate-100">{tickets.map((item) => <li key={item.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate font-medium">{item.title}</p><p className="mt-1 text-xs text-slate-500">{item.glpiTicketId ? `GLPI #${item.glpiTicketId}` : resultLabel(item.resultState)} · {formatDate(item.glpiCreatedAt ?? item.createdAt)} · {glpiStatus(item.status)}</p><p className="mt-1 text-xs text-slate-500">Resultado: {resultLabel(item.resultState)} · Última sincronização: {formatDate(item.lastSyncedAt)}</p>{item.resultState === 'uncertain' && <p className="mt-2 text-xs font-medium text-amber-800">Verifique no GLPI antes de iniciar outra tentativa.</p>}</div>{canViewDetails && <Button type="button" variant="outline" onClick={() => void openDetails(item)}>Detalhes</Button>}</li>)}</ul>}
    </section>
    {showGlpiTest && <GlpiTestPanel request={request} />}
  </div>;
}
