import { DataStorageError } from '../../../db/data-errors.ts';
import type { CategoryCreateInput, CategoryUpdateInput, RecordCreateInput, RecordUpdateInput } from '../../../db/data-types.ts';
import { DataValidationError, readJsonBody, validatePayload } from './validation.ts';

export interface DataStorage {
  readAll(): Promise<unknown>;
  createCategory(data: CategoryCreateInput): Promise<void>;
  updateCategory(data: CategoryUpdateInput): Promise<void>;
  createRecord(data: RecordCreateInput): Promise<void>;
  updateRecord(data: RecordUpdateInput): Promise<void>;
}

function errorResponse(error: unknown, fallback: string): Response {
  if (error instanceof DataValidationError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof DataStorageError) {
    switch (error.code) {
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

export function createDataHandlers(storage: DataStorage) {
  return {
    async GET() {
      try {
        return Response.json(await storage.readAll());
      } catch {
        return Response.json({ error: 'Falha ao carregar dados.' }, { status: 500 });
      }
    },

    async POST(request: Request) {
      try {
        const payload = validatePayload(await readJsonBody(request), 'POST');
        if (payload.kind === 'category') await storage.createCategory(payload.data);
        else await storage.createRecord(payload.data);
        return Response.json(await storage.readAll(), { status: 201 });
      } catch (error) {
        return errorResponse(error, 'Falha ao salvar os dados.');
      }
    },

    async PUT(request: Request) {
      try {
        const payload = validatePayload(await readJsonBody(request), 'PUT');
        if (payload.kind === 'category') {
          await storage.updateCategory(payload.data as CategoryUpdateInput);
        } else {
          await storage.updateRecord(payload.data as RecordUpdateInput);
        }
        return Response.json(await storage.readAll());
      } catch (error) {
        return errorResponse(error, 'Falha ao atualizar os dados.');
      }
    },
  };
}
