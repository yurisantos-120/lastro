'use client';
import { Alert, AlertStatus } from '@/components/ui/alert';
import { FormField } from '@/components/form-field';

import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createOperationId } from '@/lib/operation-id';
import { editableRfo } from '@/services/rfo/rfo';
import type {
  RfoFields,
  RfoRecord,
  RfoDetail,
  RfoUpdate,
} from '@/services/rfo/rfo';
import type { LocalTicket } from '@/services/tickets/types';

const empty: RfoFields = {
  investigation: 'investigating',
  completion: 'pending',
  cause: '',
  technicalDescription: '',
  solution: '',
  responsibleTeam: '',
  notes: '',
};
const time = (value: string | null) =>
  value ? new Date(value).toLocaleString('pt-BR') : 'Não registrada';
export function RfoContent({ rfo }: { rfo: RfoRecord }) {
  return (
    <dl className="space-y-2 text-sm">
      <div>
        <dt className="font-medium">Investigação / RFO</dt>
        <dd>
          {rfo.investigation === 'investigating'
            ? 'Em análise'
            : 'Causa confirmada'}{' '}
          · {rfo.completion === 'completed' ? 'RFO concluída' : 'RFO pendente'}
        </dd>
      </div>
      {(
        [
          ['Causa', rfo.cause],
          ['Descrição técnica', rfo.technicalDescription],
          ['Solução aplicada', rfo.solution],
          ['Empresa / equipe', rfo.responsibleTeam],
          ['Observações', rfo.notes],
        ] as const
      ).map(([label, value]) => (
        <div key={label}>
          <dt className="font-medium">{label}</dt>
          <dd className="whitespace-pre-wrap break-words">
            {value || 'Não informado'}
          </dd>
        </div>
      ))}
      <div>
        <dt className="font-medium">Normalização registrada</dt>
        <dd>{time(rfo.normalizedAt)}</dd>
      </div>
      <div>
        <dt className="font-medium">Última revisão / conclusão da RFO</dt>
        <dd>
          {time(rfo.updatedAt)} · {time(rfo.completedAt)}
        </dd>
      </div>
    </dl>
  );
}
export function RfoPanel({
  ticket,
  request,
  canEdit,
}: {
  ticket: LocalTicket;
  request: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  canEdit: boolean;
}) {
  const [detail, setDetail] = useState<RfoDetail | null>(null),
    [draft, setDraft] = useState<RfoFields>(empty),
    [baseRevision, setBaseRevision] = useState(0);
  const [loading, setLoading] = useState(true),
    [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [page, setPage] = useState(1),
    [reload, setReload] = useState(0),
    [retry, setRetry] = useState<RfoUpdate | null>(null);
  const busy = useRef(false),
    initialized = useRef(false);
  const url = `/api/tickets/${ticket.id}/rfo`;
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      try {
        const response = await request(`${url}?page=${page}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const body = (await response.json()) as RfoDetail & {
          message?: string;
        };
        if (!response.ok)
          throw new Error(body.message || 'Falha ao carregar RFO.');
        if (controller.signal.aborted) return;
        setDetail(body);
        setError('');
        if (!initialized.current) {
          setDraft(editableRfo(body.rfo ?? empty));
          setBaseRevision(body.rfo?.revision ?? 0);
          setRetry(null);
          initialized.current = true;
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : 'Falha ao carregar RFO.',
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [request, url, page, reload]);
  async function save(event?: SubmitEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (busy.current || !detail || !canEdit) return;
    busy.current = true;
    setPending(true);
    setError('');
    setMessage('');
    const payload = retry ?? {
      ...draft,
      operationKey: createOperationId(),
      expectedRevision: baseRevision,
    };
    setRetry(payload);
    try {
      const response = await request(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as RfoDetail & { message?: string };
      if (!response.ok) {
        if (response.status < 500) setRetry(null);
        throw new Error(body.message || 'Falha ao registrar RFO.');
      }
      setDetail(body);
      setDraft(editableRfo(body.rfo ?? empty));
      setBaseRevision(body.rfo?.revision ?? 0);
      setPage(1);
      setRetry(null);
      setMessage(
        'Revisão registrada. O estado do chamado e o GLPI permanecem independentes.',
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Resposta não confirmada. Repita a mesma revisão para consultar o resultado.',
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  const text = (
    name:
      | 'cause'
      | 'technicalDescription'
      | 'solution'
      | 'responsibleTeam'
      | 'notes',
    label: string,
    max: number,
    short = false,
  ) => (
    <FormField key={name} className="block space-y-1 text-sm" label={label}
      indication={name === 'cause' ? (draft.investigation === 'confirmed' || draft.completion === 'completed' ? 'required' : 'optional') : ['technicalDescription', 'solution'].includes(name) ? (draft.completion === 'completed' ? 'required' : 'optional') : 'none'}
      description={name === 'cause' ? 'Obrigatório ao confirmar a causa ou concluir a RFO.' : ['technicalDescription', 'solution'].includes(name) ? 'Obrigatório para concluir a RFO; pode ficar em investigação enquanto incompleta.' : undefined}>{short ? (
        <Input
          id={`rfo-${name}`}
          value={draft[name]}
          maxLength={max}
          onChange={(event) =>
            setDraft({ ...draft, [name]: event.target.value })
          }
        />
      ) : (
        <Textarea
          id={`rfo-${name}`}
          value={draft[name]}
          maxLength={max}
          rows={4}
          onChange={(event) =>
            setDraft({ ...draft, [name]: event.target.value })
          }
        />
      )}
    </FormField>
  );
  return (
    <section
      aria-labelledby="rfo-title"
      className="space-y-4 rounded-2xl border border-border bg-card p-5 text-card-foreground sm:p-6"
    >
      <h2
        id="rfo-title"
        className="flex items-center gap-2 text-xl font-semibold"
      >
        <FileText aria-hidden="true" className="size-5" />
        RFO — causa e solução
      </h2>
      <p className="text-sm text-muted-foreground">
        A investigação pode começar antes da normalização e sem causa
        definitiva. A RFO não bloqueia a normalização nem altera o status GLPI.
      </p>
      {error && (
        <Alert id="rfo-feedback" variant="error"
          
          className="rounded-lg border border-destructive p-3 text-sm"
        >
          {error}
        </Alert>
      )}
      {message && <AlertStatus variant="success" className="block text-sm">{message}</AlertStatus>}
      {loading ? (
        <AlertStatus variant="info" className="block">Carregando RFO e revisões…</AlertStatus>
      ) : detail ? (
        <>
          {detail.rfo ? (
            <details open>
              <summary className="cursor-pointer font-medium">
                RFO registrada · revisão {detail.rfo.revision} · GLPI #
                {detail.rfo.glpiTicketId}
              </summary>
              <div className="mt-3">
                <RfoContent rfo={detail.rfo} />
              </div>
            </details>
          ) : (
            <p className="text-sm">
              RFO ainda não iniciada. Não há dados ou revisões fictícios.
            </p>
          )}
          {canEdit &&
            ticket.resultState === 'created' &&
            ticket.glpiTicketId && (
              <form aria-describedby={error ? "rfo-feedback" : undefined}
                onSubmit={(event) => void save(event)}
                className="space-y-4"
              >
                <fieldset
                  disabled={pending || Boolean(retry)}
                  className="space-y-4"
                >
                  <legend className="font-medium">
                    Editar RFO · revisão de base {baseRevision}
                  </legend>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField className="space-y-1 text-sm" label={<>Situação da investigação</>} indication="none"><select
                        id="rfo-investigation"
                        className="block h-10 w-full rounded border border-input bg-background px-2"
                        value={draft.investigation}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            investigation: event.target
                              .value as RfoFields['investigation'],
                          })
                        }
                      >
                        <option value="investigating">Em análise</option>
                        <option value="confirmed">Causa confirmada</option>
                      </select>
                    </FormField>
                    <FormField className="space-y-1 text-sm" label={<>Situação da RFO</>} indication="none"><select
                        id="rfo-completion"
                        className="block h-10 w-full rounded border border-input bg-background px-2"
                        value={draft.completion}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            completion: event.target
                              .value as RfoFields['completion'],
                          })
                        }
                      >
                        <option value="pending">Pendente</option>
                        <option value="completed">Concluída</option>
                      </select>
                    </FormField>
                  </div>
                  {text(
                    'cause',
                    'Causa da ocorrência',
                    4000,
                  )}
                  {text(
                    'technicalDescription',
                    'Descrição técnica do problema',
                    10000,
                  )}
                  {text('solution', 'Solução aplicada', 10000)}
                  <p className="text-sm">
                    Normalização disponível:{' '}
                    {time(detail.normalizationAvailable)}. Essa data vem do
                    acompanhamento operacional, sem aceitar horário arbitrário
                    neste formulário.
                  </p>
                  {text(
                    'responsibleTeam',
                    'Empresa ou equipe responsável (opcional)',
                    240,
                    true,
                  )}
                  {text(
                    'notes',
                    'Observações complementares (opcional)',
                    10000,
                  )}
                  <p className="text-sm text-muted-foreground">
                    Para concluir: causa confirmada, descrição técnica, solução
                    e normalização registrada. Incidentes podem envolver
                    atenuação, equipamento, fibra ou outras causas.
                  </p>
                </fieldset>
                <div className="lastro-form-actions flex flex-wrap gap-2">
                  <Button type="submit" disabled={pending}>
                    {pending
                      ? 'Registrando…'
                      : retry
                        ? 'Consultar resultado / repetir a mesma revisão'
                        : 'Salvar revisão da RFO'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      if (
                        window.confirm(
                          'Recarregar substitui o formulário pelos dados registrados. Continuar?',
                        )
                      ) {
                        initialized.current = false;
                        setRetry(null);
                        setPage(1);
                        setReload((value) => value + 1);
                      }
                    }}
                  >
                    Recarregar dados registrados
                  </Button>
                </div>
              </form>
            )}
          <h3 className="font-semibold">Histórico completo de revisões</h3>
          {detail.revisions.length ? (
            <ol className="space-y-3">
              {detail.revisions.map((revision) => (
                <li
                  key={revision.id}
                  className="rounded-xl border border-border p-3"
                >
                  <p className="text-sm font-medium">
                    Revisão {revision.revision} · {revision.actorName} ·{' '}
                    {time(revision.recordedAt)}
                  </p>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm">
                      Consultar esta versão<span className="sr-only"> — revisão {revision.revision} do chamado local #{ticket.id}</span>
                    </summary>
                    <div className="mt-3">
                      <RfoContent rfo={revision.snapshot} />
                    </div>
                  </details>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhuma revisão nesta página.
            </p>
          )}
          <nav
            aria-label="Paginação das revisões de RFO"
            className="flex flex-wrap items-center gap-3"
          >
            <Button
              type="button"
              variant="outline"
              disabled={pending || page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Anterior
            </Button>
            <span className="text-sm">
              Página {page} · {detail.total} revisões
            </span>
            <Button
              type="button"
              variant="outline"
              disabled={pending || page * 20 >= detail.total}
              onClick={() => setPage((value) => value + 1)}
            >
              Próxima
            </Button>
          </nav>
        </>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => setReload((value) => value + 1)}
        >
          Tentar carregar RFO novamente
        </Button>
      )}
    </section>
  );
}
