'use client';
import { Alert, AlertStatus } from '@/components/ui/alert';
import { FormField } from '@/components/form-field';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createOperationId } from '@/lib/operation-id';
import type { LocalTicket } from '@/services/tickets/types';
import type {
  IntegrationAction,
  IntegrationOperation,
} from '@/services/glpi/integration';

type History = {
  ticket: LocalTicket;
  operations: IntegrationOperation[];
  active: IntegrationOperation | null;
  divergence: string | null;
  page: number;
  events: {
    id: number;
    operationId: string;
    actorId: number;
    actorName: string;
    recordedAt: string;
    snapshotJson: string;
  }[];
};
const actions = {
  sync: 'Sincronização',
  update: 'Atualização',
  solution: 'Solução',
  close: 'Fechamento',
  associate: 'Reconciliação de abertura',
};
const states = {
  pending: 'Em andamento / aguardando consulta',
  uncertain: 'Resultado incerto — reconciliação necessária',
  confirmed: 'Confirmado por consulta remota',
  failed: 'Não confirmado / falha',
};
const codeMessages: Record<string, string> = {
  NOT_SOLVED:
    'O GLPI ainda não apresenta solução (status 5); fechamento não enviado.',
  ALREADY_SOLVED:
    'O GLPI já apresenta solução ou fechamento; nenhuma nova solução foi enviada.',
  ALREADY_CLOSED: 'O GLPI já apresenta fechamento; atualização não enviada.',
  REMOTE_CHANGED:
    'Os dados remotos mudaram. Sincronize e revise antes de substituir o conteúdo.',
  ASSOCIATION_MISMATCH:
    'O ID remoto não está livre ou os dados não correspondem. Revise o vínculo.',
  GLPI_FORBIDDEN:
    'A conta técnica não tem permissão no GLPI. Confira perfil e entidade.',
  GLPI_CONFIG_ERROR:
    'Configuração indisponível. Verifique HTTPS e os segredos no servidor.',
  RECONCILIATION_REQUIRED:
    'O resultado ainda não foi confirmado. Use a reconciliação por consulta.',
  GLPI_TICKET_UNCERTAIN:
    'O envio teve resultado incerto. Nenhum reenvio automático será feito.',
};
export function IntegrationHistory({
  data,
  loading,
  error,
}: {
  data: History | null;
  loading: boolean;
  error: string;
}) {
  return (
    <div aria-live="polite">
      {loading && <AlertStatus variant="info" className="block">Carregando integração…</AlertStatus>}
      {error && (
        <Alert id="integration-feedback" variant="error"  className="text-destructive">
          {error}
        </Alert>
      )}
      {data?.divergence && (
        <output className="my-3 flex gap-2 text-amber-700 dark:text-amber-400">
          <AlertTriangle className="size-4 shrink-0" />
          {data.divergence}
        </output>
      )}
      {data && (
        <>
          <p className="text-xs text-muted-foreground">
            Última sincronização:{' '}
            {data.ticket.lastSyncedAt
              ? new Date(data.ticket.lastSyncedAt).toLocaleString('pt-BR')
              : 'Ainda não realizada'}
          </p>
          {!data.operations.length && (
            <p className="mt-2 text-sm">
              Nenhuma operação de integração registrada nesta página.
            </p>
          )}
          <ol className="mt-3 space-y-2">
            {data.operations.map((operation) => (
              <li key={operation.id} className="rounded-md border p-3 text-sm">
                <p className="font-medium">
                  {actions[operation.action]} · {states[operation.state]}
                </p>
                {codeMessages[operation.code] && (
                  <p className="mt-1">{codeMessages[operation.code]}</p>
                )}
                <p>
                  GLPI #{operation.remoteId} ·{' '}
                  {new Date(operation.updatedAt).toLocaleString('pt-BR')}
                </p>
                {operation.solutionId && (
                  <p>Solução GLPI #{operation.solutionId}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {operation.code || 'Envio registrado'} · {operation.id}
                </p>
              </li>
            ))}
          </ol>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm">
              Histórico das tentativas e confirmações
            </summary>
            <ol className="mt-2 space-y-2">
              {data.events.map((event) => {
                const snapshot = JSON.parse(event.snapshotJson) as {
                  action: IntegrationAction;
                  state: IntegrationOperation['state'];
                  code: string;
                  request?: {
                    title?: string;
                    content?: string;
                    attestation?: string;
                  };
                  observation?: { remoteStatus?: number | null };
                };
                return (
                  <li key={event.id} className="border-l-2 pl-3 text-xs">
                    <p>
                      {event.actorName} ·{' '}
                      {new Date(event.recordedAt).toLocaleString('pt-BR')} ·{' '}
                      {actions[snapshot.action]} · {states[snapshot.state]} ·{' '}
                      {snapshot.code}
                      {snapshot.observation?.remoteStatus != null &&
                        ` · Status oficial ${snapshot.observation.remoteStatus}`}
                    </p>
                    {snapshot.request && (
                      <details>
                        <summary className="cursor-pointer">
                          Dados enviados nesta tentativa
                        </summary>
                        <p className="whitespace-pre-wrap break-words">
                          {snapshot.request.title}
                          {snapshot.request.title && '\n'}
                          {snapshot.request.content}
                          {snapshot.request.attestation}
                        </p>
                      </details>
                    )}
                  </li>
                );
              })}
            </ol>
          </details>
        </>
      )}
    </div>
  );
}
export function GlpiIntegrationPanel({
  ticket,
  request,
  admin,
  onUpdated,
}: {
  ticket: LocalTicket;
  admin: boolean;
  request: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  onUpdated: (ticket: LocalTicket) => void;
}) {
  const [data, setData] = useState<History | null>(null),
    [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [action, setAction] = useState<IntegrationAction>('solution'),
    [title, setTitle] = useState(ticket.title),
    [content, setContent] = useState('');
  const [candidate, setCandidate] = useState(
      ticket.glpiTicketId ? String(ticket.glpiTicketId) : '',
    ),
    [attestation, setAttestation] = useState(''),
    [confirmed, setConfirmed] = useState(false);
  const sequence = useRef(0);
  const fieldId = useId();
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, [ticket.id]);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const current = ++sequence.current;
      setLoading(true);
      try {
        const response = await request(
          `/api/tickets/${ticket.id}/integration?page=${page}`,
          { cache: 'no-store', signal },
        );
        const body = (await response.json()) as History & {
          success?: boolean;
          message?: string;
        };
        if (!response.ok || !body.success)
          throw new Error(
            body.message || 'Não foi possível consultar a integração.',
          );
        if (alive.current && !signal?.aborted && current === sequence.current) {
          setData(body);
          setError('');
        }
        return body as History;
      } catch (cause) {
        if (!signal?.aborted && current === sequence.current)
          setError(
            cause instanceof Error ? cause.message : 'Falha na consulta.',
          );
        return null;
      } finally {
        if (!signal?.aborted && current === sequence.current) setLoading(false);
      }
    },
    [ticket.id, request, page],
  );
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) return load(controller.signal);
    });
    return () => {
      controller.abort();
    };
  }, [load, ticket.revision]);
  async function send(reconcileKey?: string) {
    if (busy || !data || (!reconcileKey && !confirmed)) return;
    setBusy(true);
    setError('');
    try {
      const payload = reconcileKey
        ? { reconcileKey }
        : {
            operationKey: createOperationId(),
            action,
            expectedRevision: data.ticket.revision,
            ...(action === 'update'
              ? { title, content }
              : action === 'solution'
                ? { content }
                : action === 'associate'
                  ? { candidateId: Number(candidate), attestation }
                  : {}),
          };
      const response = await request(`/api/tickets/${ticket.id}/integration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as {
        success?: boolean;
        message?: string;
      };
      if (!response.ok || !body.success)
        throw new Error(
          body.message || 'Falha na operação. Consulte o histórico.',
        );
      const fresh = await load();
      if (fresh && alive.current) onUpdated(fresh.ticket);
      setConfirmed(false);
    } catch (cause) {
      // Never repeat a write after a lost response. GET history reveals the durable reservation.
      await load();
      setError(
        cause instanceof Error
          ? cause.message
          : 'Resultado desconhecido. Consulte o histórico antes de agir.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-labelledby="glpi-integration-title"
      className="space-y-4 rounded-xl border bg-card p-4 text-card-foreground"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="glpi-integration-title" className="font-semibold">
          Integração e reconciliação GLPI
        </h3>
        <Button
          type="button"
          variant="outline"
          disabled={busy || loading}
          onClick={() => void load()}
        >
          <RefreshCw className="size-4" />
          Consultar histórico local
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Situação do NOC, resultado da abertura e status oficial GLPI são
        independentes. Registrar solução pode deixar o chamado solucionado (5)
        ou fechado (6), conforme o GLPI. Nenhuma ação altera automaticamente o
        acompanhamento, a RFO ou as passagens.
      </p>
      <IntegrationHistory data={data} loading={loading} error={error} />
      {data?.active ? (
        <div className="rounded-md border border-amber-500 p-3 text-sm">
          <p>
            {states[data.active.state]}. Uma consulta sem confirmação manterá o
            bloqueio de novos envios.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-2"
            disabled={busy || loading}
            onClick={() => void send(data.active!.id)}
          >
            Reconciliar por consulta ao GLPI
          </Button>
        </div>
      ) : (
        data && (
          <form aria-describedby={error ? "integration-feedback" : undefined}
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <FormField className="grid gap-1 text-sm" label={<>Operação</>} indication="none"><select
                className="rounded-md border bg-background p-2"
                value={action}
                disabled={busy}
                onChange={(event) => {
                  setAction(event.target.value as IntegrationAction);
                  setConfirmed(false);
                }}
              >
                {ticket.resultState === 'created' ? (
                  <>
                    <option value="sync">Consultar e sincronizar GLPI</option>
                    <option value="update">
                      Atualizar título e descrição GLPI
                    </option>
                    <option value="solution">Registrar solução no GLPI</option>
                    <option value="close">Solicitar fechamento GLPI</option>
                  </>
                ) : (
                  <option value="solution" disabled>
                    Abertura ainda não confirmada
                  </option>
                )}
                {admin &&
                  ['pending', 'uncertain'].includes(ticket.resultState) && (
                    <option value="associate">
                      Associar abertura após revisão manual
                    </option>
                  )}
              </select>
            </FormField>
            {action === 'update' && (
              <FormField className="grid gap-1 text-sm" label={<>Título</>} indication="auto"><Input
                  id={`${fieldId}-title`}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={255}
                  required
                  disabled={busy}
                />
              </FormField>
            )}
            {['update', 'solution'].includes(action) && (
              <FormField className="grid gap-1 text-sm" label={<>{action === 'solution'
                  ? 'Solução técnica'
                  : 'Descrição completa que substituirá a atual'}</>} indication="auto"><Textarea
                  id={`${fieldId}-content`}
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  maxLength={10000}
                  required
                  disabled={busy}
                />
              </FormField>
            )}
            {action === 'associate' && (
              <>
                <p className="text-sm">
                  Confira no GLPI a origem, o título e o conteúdo exatos. Textos
                  iguais não comprovam identidade. Somente admin pode confirmar
                  esse vínculo.
                </p>
                <FormField className="grid gap-1 text-sm" label={<>ID GLPI revisado</>} indication="auto"><Input
                    id={`${fieldId}-candidate`}
                    type="number"
                    min={1}
                    step={1}
                    value={candidate}
                    onChange={(event) => setCandidate(event.target.value)}
                    required
                    disabled={busy}
                  />
                </FormField>
                <FormField className="grid gap-1 text-sm" label={<>Evidência da revisão manual</>} indication="auto"><Textarea
                    id={`${fieldId}-attestation`}
                    value={attestation}
                    onChange={(event) => setAttestation(event.target.value)}
                    maxLength={2000}
                    required
                    disabled={busy}
                  />
                </FormField>
              </>
            )}
            {action === 'close' && (
              <p className="text-sm">
                O servidor consultará o GLPI e enviará status 6 somente se o
                status atual for 5. A conta técnica continua sujeita às
                permissões e regras do GLPI.
              </p>
            )}
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                disabled={busy}
                className="mt-1"
              />
              Confirmo a operação selecionada no chamado GLPI #
              {action === 'associate'
                ? candidate || 'a revisar'
                : ticket.glpiTicketId}
              . Não incluí credenciais.
            </label>
            <Button
              type="submit"
              disabled={
                busy ||
                loading ||
                !confirmed ||
                (ticket.resultState !== 'created' &&
                  !(admin && action === 'associate'))
              }
            >
              <CheckCircle2 className="size-4" />
              {busy ? 'Consultando resultado…' : 'Confirmar operação'}
            </Button>
          </form>
        )
      )}
      {data && (
        <nav
          aria-label="Páginas do histórico de integração"
          className="flex items-center gap-3"
        >
          <Button
            type="button"
            variant="outline"
            disabled={busy || loading || page === 1}
            onClick={() => setPage(page - 1)}
          >
            Anterior
          </Button>
          <span className="text-sm">Página {page}</span>
          <Button
            type="button"
            variant="outline"
            disabled={
              busy ||
              loading ||
              (data.operations.length < 20 && data.events.length < 50)
            }
            onClick={() => setPage(page + 1)}
          >
            Próxima
          </Button>
        </nav>
      )}
    </section>
  );
}
