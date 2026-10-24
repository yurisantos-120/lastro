'use client';
import { FormField } from '@/components/form-field';

import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertStatus } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CatalogRoutePicker } from '@/components/catalog-route-picker';
import { createOperationId } from '@/lib/operation-id';
import { operationalStateLabels, operationalStates } from '@/services/tickets/operations';
import type { OperationalDetail, OperationalFields, OperationalUpdate } from '@/services/tickets/operations';
import type { LocalTicket } from '@/services/tickets/types';

const empty: OperationalFields = { occurrenceType: '', routeDescription: '', routeId: null, responsibleOrganization: '', state: 'in_progress', pendingReason: '', notes: '', guidance: '' };
function editableFields(value: OperationalFields): OperationalFields {
  return {
    occurrenceType: value.occurrenceType, routeDescription: value.routeDescription, routeId: value.routeId,
    responsibleOrganization: value.responsibleOrganization, state: value.state, pendingReason: value.pendingReason,
    notes: value.notes, guidance: value.guidance,
  };
}
const date = (value: string | null) => value ? new Date(value).toLocaleString('pt-BR') : '—';

export function TicketOperationsPanel({ ticket, request }: {
  ticket: LocalTicket;
  request: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}) {
  const [detail, setDetail] = useState<OperationalDetail | null>(null);
  const [draft, setDraft] = useState<OperationalFields>(empty);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState<OperationalUpdate | null>(null);
  const [reload, setReload] = useState(0);
  const busy = useRef(false);
  const url = `/api/tickets/${ticket.id}/operations`;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      try {
        const response = await request(url, { cache: 'no-store', signal: controller.signal });
        const body = await response.json() as OperationalDetail & { message?: string };
        if (!response.ok) throw new Error(body.message || 'Falha ao carregar dados operacionais.');
        if (controller.signal.aborted) return;
        setDetail(body); setDraft(editableFields(body.operation ?? empty)); setDescription(''); setRetry(null); setError('');
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Falha ao carregar dados operacionais.');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [request, url, reload]);

  async function save(event?: SubmitEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (busy.current || !detail) return;
    busy.current = true; setPending(true); setError(''); setMessage('');
    const payload: OperationalUpdate = retry ?? { ...draft, description, operationKey: createOperationId(), expectedRevision: detail.operation?.revision ?? 0 };
    setRetry(payload);
    try {
      const response = await request(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await response.json() as OperationalDetail & { message?: string };
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) setRetry(null);
        throw new Error(body.message || 'Falha ao registrar movimentação.');
      }
      setDetail(body); setDraft(editableFields(body.operation ?? empty)); setDescription(''); setRetry(null);
      setMessage('Movimentação registrada no histórico. Nenhuma alteração foi enviada ao GLPI.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Resposta não confirmada. Use “Consultar resultado / repetir” para manter a mesma movimentação.');
    } finally { busy.current = false; setPending(false); }
  }

  const disabled = pending || Boolean(retry);
  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6" aria-labelledby="ticket-operations-title">
    <h2 id="ticket-operations-title" className="text-xl font-semibold">Acompanhamento operacional</h2>
    <p className="text-sm text-slate-600">A situação operacional é local e independente do status oficial GLPI. Fechado exige confirmação oficial já consultada; esta tela não fecha chamados no GLPI.</p>
    {error && <Alert id="operational-feedback" variant="error">{error}</Alert>}
    {message && <AlertStatus variant="success">{message}</AlertStatus>}
    {loading ? <AlertStatus variant="info" className="block">Carregando acompanhamento…</AlertStatus> : <>
      {detail?.operation ? <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div><dt>Situação operacional</dt><dd className="font-semibold">{operationalStateLabels[detail.operation.state]}</dd></div>
        <div><dt>Abertura registrada no Lastro</dt><dd>{date(detail.operation.openedAt)}</dd></div>
        <div><dt>Última atualização operacional</dt><dd>{date(detail.operation.updatedAt)}</dd></div>
        <div><dt>Normalização</dt><dd>{date(detail.operation.normalizedAt)}</dd></div>
        <div><dt>Encerramento registrado após confirmação GLPI</dt><dd>{date(detail.operation.closedAt)}</dd></div>
      </dl> : <p className="text-sm text-slate-600">Sem acompanhamento operacional registrado. Os dados anteriores do chamado foram preservados.</p>}
      {detail && ticket.resultState === 'created' && ticket.glpiTicketId ? <form aria-describedby={error ? "operational-feedback" : undefined} onSubmit={(event) => void save(event)} className="space-y-4">
        <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 font-medium">Registrar movimentação</legend>
          <FormField className="space-y-1 text-sm" label={<>Tipo de ocorrência</>} indication="auto"><Input id="operational-field-1" maxLength={160} value={draft.occurrenceType} onChange={(event) => setDraft({ ...draft, occurrenceType: event.target.value })} /></FormField>
          <FormField className="space-y-1 text-sm" label={<>Empresa ou gerência responsável</>} indication="auto"><Input id="operational-field-2" maxLength={240} value={draft.responsibleOrganization} onChange={(event) => setDraft({ ...draft, responsibleOrganization: event.target.value })} /></FormField>
          <FormField className="space-y-1 text-sm" label={<>Trecho ou rota afetada (texto livre)</>} indication="auto"><Input id="operational-field-3" maxLength={500} value={draft.routeDescription} onChange={(event) => setDraft({ ...draft, routeDescription: event.target.value })} /></FormField>
          <FormField className="space-y-1 text-sm" label={<>Vínculo explícito com rota cadastrada (opcional)</>} indication="none"><CatalogRoutePicker request={request} value={draft.routeId} onChange={(routeId) => setDraft((current) => ({ ...current, routeId }))} /></FormField>
          <FormField className="space-y-1 text-sm" label={<>Situação operacional</>} indication="none"><select className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2" value={draft.state} onChange={(event) => setDraft({ ...draft, state: event.target.value as OperationalFields['state'] })}>
            {operationalStates.map((state) => <option key={state} value={state} disabled={state === 'closed' && (ticket.status !== 6 || !ticket.lastSyncedAt)}>{operationalStateLabels[state]}</option>)}
          </select></FormField>
          {draft.state === 'pending' && <FormField className="space-y-1 text-sm" label={<>Justificativa da pendência (obrigatória)</>} indication="none"><Textarea id="operational-field-4" required maxLength={2000} value={draft.pendingReason} onChange={(event) => setDraft({ ...draft, pendingReason: event.target.value })} /></FormField>}
          <FormField className="space-y-1 text-sm" label={<>Observações (opcional)</>} indication="none"><Textarea id="operational-field-5" maxLength={10000} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></FormField>
          <FormField className="space-y-1 text-sm" label={<>Orientações (opcional)</>} indication="none"><Textarea id="operational-field-6" maxLength={10000} value={draft.guidance} onChange={(event) => setDraft({ ...draft, guidance: event.target.value })} /></FormField>
          <FormField className="space-y-1 text-sm sm:col-span-2" label={<>Descrição desta movimentação (opcional)</>} indication="none"><Textarea id="operational-field-7" maxLength={4000} value={description} onChange={(event) => setDescription(event.target.value)} /></FormField>
        </fieldset>
        <div className="lastro-form-actions flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>{pending ? 'Registrando…' : retry ? 'Consultar resultado / repetir a mesma movimentação' : 'Registrar movimentação'}</Button>
          <Button type="button" variant="outline" disabled={pending} onClick={() => { if (window.confirm('Recarregar substitui o formulário pelos dados registrados. Continuar?')) { setMessage(''); setReload((value) => value + 1); } }}>Recarregar dados registrados</Button>
        </div>
      </form> : <p className="text-sm text-amber-800">O acompanhamento poderá ser iniciado após a abertura confirmada pelo GLPI.</p>}
      {!detail && <Button type="button" variant="outline" onClick={() => setReload((value) => value + 1)}>Tentar carregar novamente</Button>}
      <h3 className="font-semibold">Histórico de movimentações</h3>
      {!detail?.events.length ? <p className="text-sm text-slate-500">Nenhuma movimentação operacional registrada.</p> : <ol className="space-y-3">{detail.events.map((event) => <li key={event.id} className="rounded-xl border border-slate-200 p-3 text-sm">
        <p className="font-medium">{event.actorName} · {date(event.occurredAt)}</p>
        <p>{event.type === 'initialized' ? 'Acompanhamento iniciado' : event.type === 'state_changed' ? 'Situação alterada' : 'Informações atualizadas'}: {event.previousState ? `${operationalStateLabels[event.previousState]} → ` : ''}{operationalStateLabels[event.nextState]}</p>
        {event.description && <p className="mt-2 whitespace-pre-wrap break-words">{event.description}</p>}
        <details className="mt-2"><summary className="cursor-pointer">Dados registrados nesta movimentação</summary><dl className="mt-2 space-y-1">
          {([['Ocorrência', event.snapshot.occurrenceType], ['Trecho / rota', event.snapshot.routeDescription], ['Rota vinculada', event.snapshot.routeId ? `#${event.snapshot.routeId}` : 'Sem vínculo'], ['Empresa / gerência', event.snapshot.responsibleOrganization], ['Pendência', event.snapshot.pendingReason], ['Observações', event.snapshot.notes], ['Orientações', event.snapshot.guidance]] as const).map(([label, value]) => <div key={label}><dt className="font-medium">{label}</dt><dd className="whitespace-pre-wrap break-words">{value || '—'}</dd></div>)}
        </dl></details>
      </li>)}</ol>}
    </>}
  </section>;
}
