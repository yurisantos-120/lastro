'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type SubmitEvent } from 'react';
import { Alert, AlertStatus } from '@/components/ui/alert';
import { FormSubmissionError, SubmissionGate } from '@/lib/form-submission';
import { createOperationId } from '@/lib/operation-id';
import { Button } from '@/components/ui/button';
import type { DataIntent } from '@/lib/data-intents';

const SubmissionContext = createContext(false);
export function useSubmissionDisabled() { return useContext(SubmissionContext); }

export function PreservedForm({ action, children, conflict = false, resume, onDefer }: {
  action: (data: FormData) => void | Promise<void>;
  children: ReactNode;
  conflict?: boolean;
  resume?: DataIntent;
  onDefer?: () => void;
}) {
  const gate = useRef(new SubmissionGate());
  const form = useRef<HTMLFormElement>(null);
  const intentKey = useRef(resume?.key ?? createOperationId());
  const frozen = useRef<FormData | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [uncertain, setUncertain] = useState(Boolean(resume));
  useEffect(() => {
    if (!resume || !form.current) return;
    const saved = new FormData();
    for (const [name,value] of resume.fields) {
      saved.append(name,value);
      const field = form.current.elements.namedItem(name);
      if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) {
        const prototype=field instanceof HTMLInputElement?HTMLInputElement.prototype:field instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLTextAreaElement.prototype;
        Object.getOwnPropertyDescriptor(prototype,'value')?.set?.call(field,value);
        field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));
      }
    }
    saved.set('_dataOperationKey',resume.key);frozen.current=saved;gate.current.uncertain=true;
  }, [resume]);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (gate.current.pending || gate.current.uncertain) return;
    const data = new FormData(event.currentTarget);
    data.set('_dataOperationKey',intentKey.current);
    await send(data);
  }

  async function send(data:FormData) {
    frozen.current=data;
    setPending(true);
    setMessage('');
    const result = await gate.current.run(async () => { await action(data); });
    if (result.state === 'error') {
      const localFailure=result.error instanceof FormSubmissionError && result.error.code==='LOCAL_PERSISTENCE_UNAVAILABLE';
      const stillUnknown=result.uncertain||(uncertain&&localFailure);
      gate.current.uncertain=stillUnknown;
      setUncertain(stillUnknown);
      setMessage(result.error instanceof Error ? result.error.message : 'Não foi possível salvar. Os campos foram preservados.');
      if (!stillUnknown && !localFailure) intentKey.current=createOperationId();
    }
    setPending(false);
  }

  return <SubmissionContext value={pending || uncertain}>
    <form ref={form} onSubmit={(event) => void submit(event)} aria-busy={pending} className="space-y-4">
      {message && !conflict && <Alert variant="error">{message}</Alert>}
      {uncertain && <Alert variant="warning">Resultado ainda não confirmado. O rascunho e a chave foram preservados. Retome somente a mesma intenção; não crie outra para substituir esta tentativa.<div className="mt-2 flex flex-wrap gap-2"><Button type="button" variant="outline" className="h-auto min-h-8 max-w-full whitespace-normal" disabled={pending} onClick={() => { if (!frozen.current || gate.current.pending) return; gate.current.resumeSameIntention(); void send(frozen.current); }}>Consultar / repetir a mesma intenção</Button>{onDefer&&<Button type="button" variant="outline" disabled={pending} onClick={onDefer}>Retomar depois</Button>}</div></Alert>}
      {pending && <AlertStatus variant="info">Salvando…</AlertStatus>}
      <fieldset disabled={pending || uncertain} className="min-w-0 space-y-4">{children}</fieldset>
    </form>
  </SubmissionContext>;
}
