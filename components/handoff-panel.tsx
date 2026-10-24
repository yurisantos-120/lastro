'use client';
import { Alert, AlertStatus } from '@/components/ui/alert';
import { FormField } from '@/components/form-field';

import { useEffect, useRef, useState } from 'react';
import { Clock, ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { createOperationId } from '@/lib/operation-id';
import { operationalStateLabels } from '@/services/tickets/operations';
import type {
  HandoffList,
  HandoffPreview,
  HandoffRecord,
  Shift,
} from '@/services/handoffs/handoffs';
import type { DashboardTicket } from '@/services/tickets/dashboard';

type RequestFn = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
const time = (value: string, zone: string) =>
  new Date(value).toLocaleString('pt-BR', { timeZone: zone });
export function HandoffItems({ items }: { items: DashboardTicket[] }) {
  return items.length ? (
    <ul className="space-y-3">
      {items.map((item) => (
        <li
          key={item.id}
          className="rounded-lg border border-border p-3 text-sm"
        >
          <p className="font-semibold">
            GLPI #{item.glpiTicketId} · {item.title}
          </p>
          <p>
            Situação local:{' '}
            {item.state
              ? operationalStateLabels[item.state]
              : 'Sem acompanhamento'}{' '}
            · Status GLPI conhecido: {item.glpiStatus ?? 'Não consultado'}
          </p>
          <p>
            {item.occurrenceType || 'Tipo não informado'} ·{' '}
            {item.routeDescription || item.routeTitle || 'Trecho não informado'}
          </p>
          {item.responsibleOrganization && (
            <p>Empresa / gerência: {item.responsibleOrganization}</p>
          )}
          {item.state === 'pending' && (
            <p className="whitespace-pre-wrap break-words">
              <b>Pendência:</b> {item.pendingReason}
            </p>
          )}
          {item.lastObservation && (
            <p className="whitespace-pre-wrap break-words">
              <b>Última observação:</b> {item.lastObservation}
            </p>
          )}
          {item.guidance && (
            <p className="whitespace-pre-wrap break-words">
              <b>Orientações:</b> {item.guidance}
            </p>
          )}
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-sm text-muted-foreground">
      Nenhum chamado em tratamento, pendente ou normalizado ainda não encerrado
      no resumo.
    </p>
  );
}

export function HandoffPanel({
  request,
  canConfirm = false,
  actorId,
}: {
  request: RequestFn;
  canConfirm?: boolean;
  actorId?: number;
}) {
  const [list, setList] = useState<HandoffList | null>(null),
    [expanded, setExpanded] = useState(false),
    [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<HandoffPreview | null>(null),
    [selected, setSelected] = useState<HandoffRecord | null>(null);
  const [date, setDate] = useState(''),
    [shift, setShift] = useState<Shift>('day'),
    [notes, setNotes] = useState(''),
    [guidance, setGuidance] = useState('');
  const [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [pending, setPending] = useState(false),
    [reload, setReload] = useState(0),
    [page, setPage] = useState(1);
  const [retry, setRetry] = useState<{ url: string; body: object } | null>(
    null,
  );
  const busy = useRef(false),
    heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      try {
        const response = await request(`/api/handoffs?page=${page}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const data = (await response.json()) as HandoffList & {
          message?: string;
        };
        if (!response.ok)
          throw new Error(
            data.message || 'Não foi possível consultar passagens.',
          );
        if (!controller.signal.aborted) {
          setList(data);
          setError('');
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Falha ao consultar passagens.',
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [request, reload, page]);
  async function read(url: string, kind: 'preview' | 'detail') {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    setMessage('');
    try {
      const response = await request(url, { cache: 'no-store' });
      const body = (await response.json()) as HandoffPreview & {
        handoff: HandoffRecord;
        message?: string;
      };
      if (!response.ok)
        throw new Error(body.message || 'Não foi possível consultar o resumo.');
      if (kind === 'preview') {
        setPreview(body);
        setSelected(null);
        setDate(body.period.date);
        setShift(body.period.shift);
      } else {
        setSelected(body.handoff);
        setPreview(null);
      }
      setExpanded(true);
      setRetry(null);
      window.requestAnimationFrame(() => heading.current?.focus());
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Falha ao consultar resumo.',
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function confirm(url: string, body: object) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    setMessage('');
    const action = retry ?? { url, body };
    setRetry(action);
    try {
      const response = await request(action.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action.body),
      });
      const data = (await response.json()) as {
        handoff: HandoffRecord;
        message?: string;
      };
      if (!response.ok) {
        if (response.status < 500) setRetry(null);
        throw new Error(
          data.message || 'Não foi possível confirmar a operação.',
        );
      }
      setSelected(data.handoff);
      setPreview(null);
      setRetry(null);
      setNotes('');
      setGuidance('');
      setMessage('Confirmação registrada. Nenhum chamado foi alterado.');
      setReload((value) => value + 1);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Resposta não confirmada. Repita a mesma confirmação para consultar o resultado.',
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <aside
      className="rounded-xl border border-border bg-card p-4 text-card-foreground"
      aria-label="Passagem de turno"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Clock aria-hidden="true" className="size-5 text-muted-foreground" />
          <span className="text-sm">
            {loading
              ? 'Consultando passagens…'
              : list?.available
                ? 'Há uma passagem disponível para consulta e recebimento.'
                : 'Passagem de turno'}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          aria-expanded={expanded}
          aria-controls="handoff-content"
          onClick={() => setExpanded((value) => !value)}
        >
          <ArrowRightLeft aria-hidden="true" className="size-4" />
          {expanded ? 'Recolher' : 'Consultar passagens'}
        </Button>
      </div>
      {!expanded && error && (
        <p className="mt-2 text-sm text-muted-foreground">
          Consulta de passagens indisponível. O dashboard continua disponível.
        </p>
      )}
      {expanded && (
        <section id="handoff-content" className="mt-5 space-y-4">
          <h3
            ref={heading}
            tabIndex={-1}
            className="text-lg font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Passagem de turno
          </h3>
          <p className="text-sm text-muted-foreground">
            Escala operacional 12×36, sem escala individual automática.{' '}
            {list &&
              `Diurno ${list.config.dayStart}–${list.config.nightStart}; noturno ${list.config.nightStart}–${list.config.dayStart}${list.config.dayStart <= list.config.nightStart ? ' do dia seguinte' : ''}. Fuso: ${list.config.timeZone}.`}{' '}
            Consulta e recebimento não bloqueiam a navegação.
          </p>
          {error && (
            <Alert id="handoff-feedback" variant="error"
              
              className="rounded-lg border border-destructive p-3 text-sm"
            >
              {error}
            </Alert>
          )}
          {message && <AlertStatus variant="success" className="block text-sm">{message}</AlertStatus>}
          <div className="flex flex-wrap gap-2">
            {canConfirm && (
              <Button
                type="button"
                disabled={pending || Boolean(retry)}
                onClick={() => void read('/api/handoffs/preview', 'preview')}
              >
                Preparar entrega
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setReload((value) => value + 1)}
            >
              Atualizar histórico
            </Button>
            {list?.available && (
              <Button
                type="button"
                variant="outline"
                disabled={pending || Boolean(retry)}
                onClick={() =>
                  void read(`/api/handoffs/${list.available!.id}`, 'detail')
                }
              >
                Ver passagem disponível
              </Button>
            )}
          </div>
          {pending && <AlertStatus variant="info" className="block">Processando passagem…</AlertStatus>}
          {retry && !pending && (
            <Button
              type="button"
              onClick={() => void confirm(retry.url, retry.body)}
            >
              Consultar resultado / repetir a mesma confirmação
            </Button>
          )}
          {preview && (
            <form aria-describedby={error ? "handoff-feedback" : undefined}
              onSubmit={(event) => {
                event.preventDefault();
                void confirm('/api/handoffs', {
                  operationKey: createOperationId(),
                  date: preview.period.date,
                  shift: preview.period.shift,
                  previewToken: preview.token,
                  notes,
                  guidance,
                });
              }}
              className="space-y-4"
            >
              <fieldset
                disabled={pending || Boolean(retry)}
                className="space-y-3"
              >
                <legend className="font-medium">Preparação da entrega</legend>
                <p className="text-sm">
                  Prévia inicial: último turno concluído. Se necessário,
                  selecione outro turno já iniciado e atualize a prévia. O
                  resumo inclui a situação atual dos chamados, não uma
                  reconstrução do passado.
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <FormField className="text-sm" label={<>Data de início</>} indication="none"><Input
                      id="handoff-date"
                      type="date"
                      value={date}
                      onChange={(event) => setDate(event.target.value)}
                    />
                  </FormField>
                  <FormField className="text-sm" label={<>Turno</>} indication="none"><select
                      id="handoff-shift"
                      className="block h-10 rounded border border-input bg-background px-2"
                      value={shift}
                      onChange={(event) =>
                        setShift(event.target.value as Shift)
                      }
                    >
                      <option value="day">Diurno</option>
                      <option value="night">Noturno</option>
                    </select>
                  </FormField>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      void read(
                        `/api/handoffs/preview?${new URLSearchParams({ date, shift })}`,
                        'preview',
                      )
                    }
                  >
                    Atualizar prévia
                  </Button>
                </div>
                <p className="text-sm font-medium">
                  Período da prévia:{' '}
                  {time(preview.period.startAt, preview.config.timeZone)} até{' '}
                  {time(preview.period.endAt, preview.config.timeZone)}
                </p>
                <HandoffItems items={preview.items} />
                <FormField className="block space-y-1 text-sm" label={<>Observações gerais (opcional)</>} indication="none"><Textarea
                    id="handoff-notes"
                    maxLength={10000}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </FormField>
                <FormField className="block space-y-1 text-sm" label={<>Orientações (opcional)</>} indication="none"><Textarea
                    id="handoff-guidance"
                    maxLength={10000}
                    value={guidance}
                    onChange={(event) => setGuidance(event.target.value)}
                  />
                </FormField>
              </fieldset>
              <div className="lastro-form-actions"><Button
                type="submit"
                disabled={
                  pending ||
                  Boolean(retry) ||
                  date !== preview.period.date ||
                  shift !== preview.period.shift
                }
              >
                Confirmar entrega do turno
              </Button></div>
            </form>
          )}
          {selected && (
            <article className="space-y-3 rounded-xl border border-border p-4">
              <h4 className="font-semibold">
                {selected.period.shift === 'day' ? 'Diurno' : 'Noturno'} ·{' '}
                {time(selected.period.startAt, selected.config.timeZone)} até{' '}
                {time(selected.period.endAt, selected.config.timeZone)}
              </h4>
              <p className="text-sm">
                Entregue por {selected.deliveredName}, em{' '}
                {time(selected.deliveredAt, selected.config.timeZone)}.
              </p>
              <p className="text-sm">
                {selected.receipt
                  ? `Recebido por ${selected.receipt.receivedName}, em ${time(selected.receipt.receivedAt, selected.config.timeZone)}.`
                  : 'Recebimento ainda não confirmado. Isso não impede o trabalho no Lastro.'}
              </p>
              {selected.notes && (
                <p className="whitespace-pre-wrap break-words text-sm">
                  <b>Observações gerais:</b> {selected.notes}
                </p>
              )}
              {selected.guidance && (
                <p className="whitespace-pre-wrap break-words text-sm">
                  <b>Orientações:</b> {selected.guidance}
                </p>
              )}
              <HandoffItems items={selected.items} />
              {canConfirm && !selected.receipt && (
                <Button
                  type="button"
                  disabled={
                    pending ||
                    Boolean(retry) ||
                    actorId === selected.deliveredBy
                  }
                  onClick={() =>
                    void confirm(`/api/handoffs/${selected.id}/receive`, {
                      operationKey: createOperationId(),
                    })
                  }
                >
                  Confirmar recebimento
                </Button>
              )}
              {actorId === selected.deliveredBy && !selected.receipt && (
                <p className="text-sm text-muted-foreground">
                  Outro operador poderá confirmar o recebimento.
                </p>
              )}
            </article>
          )}
          <h4 className="font-semibold">Histórico de passagens</h4>
          {loading || (list && list.page !== page) ? (
            <AlertStatus variant="info" className="block">
              Carregando histórico de passagens…
            </AlertStatus>
          ) : !list?.items.length ? (
            <p className="text-sm text-muted-foreground">
              {error
                ? 'Histórico indisponível.'
                : 'Nenhuma passagem registrada.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {list.items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-sm"
                >
                  <span>
                    {item.period.date} ·{' '}
                    {item.period.shift === 'day' ? 'Diurno' : 'Noturno'} ·{' '}
                    {item.deliveredName} ·{' '}
                    {item.receivedAt
                      ? 'Recebimento confirmado'
                      : 'Disponível para recebimento'}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending || Boolean(retry)}
                    onClick={() =>
                      void read(`/api/handoffs/${item.id}`, 'detail')
                    }
                  >
                    Ver resumo
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <nav
            aria-label="Paginação de passagens"
            className="flex items-center gap-3"
          >
            <Button
              type="button"
              variant="outline"
              disabled={page <= 1 || pending}
              onClick={() => setPage((value) => value - 1)}
            >
              Anterior
            </Button>
            <span>Página {page}</span>
            <Button
              type="button"
              variant="outline"
              disabled={!list || page * 20 >= list.total || pending}
              onClick={() => setPage((value) => value + 1)}
            >
              Próxima
            </Button>
          </nav>
        </section>
      )}
    </aside>
  );
}
