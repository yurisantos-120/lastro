import { DataStorageError } from '../../../db/data-errors.ts';
import { CatalogQueryError, parseCatalogQuery, type CatalogQuery } from '../../../db/catalog-pagination.ts';
import { DataOperationError, operationKey, type DataMethod, type DataReceipt } from '../../../services/data/operations.ts';
import { DataValidationError, readJsonBody, validatePayload, type ParsedDataPayload } from './validation.ts';

export interface DataStorage {
  read(query: CatalogQuery): Promise<unknown>;
  execute(actorId: number, key: string, method: DataMethod, payload: ParsedDataPayload): Promise<DataReceipt>;
  recover(actorId: number, key: string): Promise<DataReceipt | null>;
}

export function errorResponse(error: unknown, fallback: string): Response {
  if (error instanceof CatalogQueryError) return Response.json({ error: error.message, code: 'INVALID_CATALOG_QUERY' }, { status: 400 });
  if (error instanceof DataOperationError) return Response.json({ error: error.message, code: error.code, outcome: error.code === 'OPERATION_KEY_CONFLICT' ? 'blocked' : error.code === 'RECEIPT_UNAVAILABLE' ? 'unknown' : 'rejected' }, {status:error.status,headers:{'Cache-Control':'no-store'}});
  if (error instanceof DataValidationError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof DataStorageError) {
    switch (error.code) {
      case 'SCHEMA_OUTDATED':
        return Response.json({ error: 'Banco de dados desatualizado. Aplique as migrations pendentes.', code: 'SCHEMA_OUTDATED' }, { status: 503 });
      case 'RECORD_NOT_FOUND':
      case 'CATEGORY_NOT_FOUND_FOR_UPDATE':
        return Response.json({ error: 'Registro ou categoria não encontrado.' }, { status: 404 });
      case 'CATEGORY_NOT_FOUND':
        return Response.json({ error: 'A categoria informada não existe.' }, { status: 400 });
      case 'REVISION_CONFLICT':
        return Response.json({ error: 'Este registro foi alterado por outro usuário. Recarregue os dados e tente novamente.' }, { status: 409 });
      case 'CATEGORY_SCOPE_MISMATCH':
        return Response.json({ error: 'A categoria não é compatível com o tipo do registro.' }, { status: 400 });
      case 'CATEGORY_SCOPE_CONFLICT':
        return Response.json({ error: 'O escopo não pode ser alterado enquanto houver registros vinculados incompatíveis.' }, { status: 400 });
    }
  }
  return Response.json({ error: fallback }, { status: 500 });
}

export function createDataHandlers(storage: DataStorage, actorId: number) {
  async function write(request: Request, method: DataMethod) {
    try {
      if (request.headers.has('origin') && request.headers.get('origin') !== new URL(request.url).origin) throw new DataOperationError('INVALID_ORIGIN','Origem não autorizada.',403);
      const payload = validatePayload(await readJsonBody(request), method);
      const key = operationKey(request.headers.get('Idempotency-Key'));
      const receipt = await storage.execute(actorId,key,method,payload);
      return Response.json({operation:receipt}, {status:method === 'POST' ? 201 : 200,headers:{'Cache-Control':'no-store'}});
    } catch (error) { return errorResponse(error, method === 'POST' ? 'Falha ao salvar os dados. Resultado não confirmado.' : 'Falha ao atualizar os dados. Resultado não confirmado.'); }
  }
  return {
    async GET(request: Request) {
      try {
        return Response.json(await storage.read(parseCatalogQuery(new URL(request.url).searchParams)), { headers: { 'Cache-Control': 'no-store' } });
      } catch (error) { return errorResponse(error, 'Falha ao carregar dados.'); }
    },

    POST: (request: Request) => write(request,'POST'),
    PUT: (request: Request) => write(request,'PUT'),
    async RECOVER(key: string) {
      try {
        const receipt = await storage.recover(actorId,operationKey(key));
        return Response.json(receipt ? {operation:receipt} : {error:'Operação ainda não confirmada. Retome somente a mesma intenção.',code:'NOT_CONFIRMED'}, {status:receipt ? 200 : 404,headers:{'Cache-Control':'no-store'}});
      } catch (error) { return errorResponse(error,'Falha ao consultar confirmação.'); }
    },
  };
}
