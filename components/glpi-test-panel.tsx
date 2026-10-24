'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { GlpiTestResult } from '@/services/glpi/types';
import type { TicketCreateApiResponse } from '@/services/tickets/types';
import { createOperationId } from '@/lib/operation-id';

export function GlpiTestPanel({ request }: { request: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> }) {
  const [title, setTitle] = useState('[TESTE NOC] Integração API GLPI');
  const [content, setContent] = useState(
    'Chamado criado pelo Sistema NOC para validação da integração com a API REST do GLPI.',
  );
  const [connection, setConnection] = useState('Não testado');
  const [message, setMessage] = useState('');
  const [ticketId, setTicketId] = useState<number | null>(null);
  const [operationKey, setOperationKey] = useState('');
  const [pending, setPending] = useState<'test' | 'ticket' | null>(null);
  const busy = useRef(false);

  async function testConnection() {
    if (busy.current) return;
    busy.current = true;
    setPending('test');
    setConnection('Testando conexão…');
    try {
      const response = await request('/api/glpi/test', { cache: 'no-store' });
      const data = (await response.json()) as GlpiTestResult;
      setConnection(
        data.success && response.ok
          ? `Conectado — GLPI ${data.version}`
          : !data.success
            ? `Falha na conexão — ${data.message} (${data.code})`
            : 'Falha ao testar conexão.',
      );
    } catch {
      setConnection('Não foi possível acessar a API interna do NOC.');
    } finally {
      busy.current = false;
      setPending(null);
    }
  }

  async function createTicket() {
    if (busy.current) return;
    busy.current = true;
    setPending('ticket');
    setMessage('');
    setTicketId(null);
    const currentOperationKey = operationKey || createOperationId();
    setOperationKey(currentOperationKey);
    try {
      const response = await request('/api/glpi/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationKey: currentOperationKey, title, content }),
      });
      const data = (await response.json()) as TicketCreateApiResponse;
      if (
        response.ok &&
        data.success &&
        Number.isSafeInteger(data.ticket?.glpiTicketId) &&
        data.ticket.glpiTicketId !== null &&
        data.ticket.glpiTicketId > 0
      ) {
        setTicketId(data.ticket.glpiTicketId);
        setMessage('Chamado criado com sucesso.');
        setOperationKey(createOperationId());
      } else {
        setMessage(
          'message' in data
            ? `${data.message} (${ 'code' in data ? data.code : 'GLPI_ERROR' })`
            : 'Resposta inesperada. Confira no GLPI antes de repetir a criação.',
        );
        if ('resultState' in data && data.resultState === 'failed') {
          setOperationKey(createOperationId());
        }
      }
    } catch {
      setMessage(
        'Não foi possível confirmar o resultado. Confira no GLPI antes de tentar novamente.',
      );
    } finally {
      busy.current = false;
      setPending(null);
    }
  }

  return (
    <details className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
      <summary className="cursor-pointer text-sm font-semibold">
        Integração GLPI — teste inicial
      </summary>
      <div className="mt-5 grid gap-6 md:grid-cols-2">
        <div className="space-y-3">
          <h2 className="font-semibold">Conexão</h2>
          <output className="block text-sm">Status: {connection}</output>
          <Button
            type="button"
            variant="outline"
            disabled={pending !== null}
            onClick={() => void testConnection()}
          >
            {pending === 'test' ? 'Testando…' : 'Testar conexão'}
          </Button>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void createTicket();
          }}
          className="space-y-3"
        >
          <h2 className="font-semibold">Chamado de teste</h2>
          <p className="text-sm text-slate-500">
            Esta ação cria um chamado real no GLPI configurado.
          </p>
          <label className="block text-sm" htmlFor="glpi-title">
            Título
          </label>
          <Input
            id="glpi-title"
            required
            maxLength={255}
            value={title}
            disabled={pending !== null}
            onChange={(event) => setTitle(event.target.value)}
          />
          <label className="block text-sm" htmlFor="glpi-content">
            Descrição
          </label>
          <Textarea
            id="glpi-content"
            required
            maxLength={10000}
            rows={4}
            value={content}
            disabled={pending !== null}
            onChange={(event) => setContent(event.target.value)}
          />
          <Button
            type="submit"
            disabled={pending !== null || !title.trim() || !content.trim()}
            variant="brand"
          >
            {pending === 'ticket' ? 'Criando…' : 'Criar chamado de teste'}
          </Button>
          <output className="block break-words text-sm">
            {message && <span className="block">{message}</span>}
            {ticketId !== null && (
              <span className="mt-2 block font-semibold">
                GLPI #{ticketId}
              </span>
            )}
          </output>
        </form>
      </div>
    </details>
  );
}
