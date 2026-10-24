import type { ReactNode } from 'react';
import { Alert, AlertStatus } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export function CollectionState({ loading, error, retry, empty = false, emptyMessage = 'Nenhum cadastro encontrado.', children }: {
  loading: boolean; error: string; retry: () => void; empty?: boolean; emptyMessage?: string; children?: ReactNode;
}) {
  if (loading) return <AlertStatus variant="info">Carregando cadastros…</AlertStatus>;
  if (error) return <Alert variant="error"><p>{error}</p><Button type="button" variant="outline" className="mt-2" onClick={retry}>Tentar novamente</Button></Alert>;
  if (empty) return <AlertStatus variant="info">{emptyMessage}</AlertStatus>;
  return children;
}
