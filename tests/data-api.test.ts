import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DataStorageError } from '../db/data-errors.ts';
import type { CatalogQuery } from '../db/catalog-pagination.ts';
import type { CategoryCreateInput, CategoryUpdateInput, RecordCreateInput, RecordUpdateInput } from '../db/data-types.ts';
import type { DataStorage } from '../app/api/data/handlers.ts';
import { createDataHandlers } from '../app/api/data/handlers.ts';
import type { ParsedDataPayload } from '../app/api/data/validation.ts';
import type { DataMethod, DataReceipt } from '../services/data/operations.ts';

type StoredCategory = CategoryCreateInput & { id: number; revision: number };
type StoredRecord = RecordCreateInput & { id: number; revision: number };

class MemoryStorage implements DataStorage {
  async execute(_actorId: number, key: string, method: DataMethod, payload: ParsedDataPayload): Promise<DataReceipt> {
    const id = method === 'POST' ? this.nextId : (payload.data as {id:number}).id;
    if (payload.kind === 'category') {
      if (method === 'POST') await this.createCategory(payload.data);
      else await this.updateCategory(payload.data as CategoryUpdateInput);
    } else {
      if (method === 'POST') await this.createRecord(payload.data as RecordCreateInput);
      else await this.updateRecord(payload.data as RecordUpdateInput);
    }
    const snapshot = (payload.kind === 'category' ? this.categories : this.records).get(id)!;
    return {key,kind:payload.kind,method,entityId:id,revision:snapshot.revision,recordedAt:new Date().toISOString(),snapshot:{...snapshot}};
  }
  async recover(): Promise<DataReceipt | null> { return null; }
  readonly categories = new Map<number, StoredCategory>([
    [1, { id: 1, revision: 1, name: 'Rotas', description: 'Rotas de fibra', color: '#ff6b2c', scope: 'general' }],
    [2, { id: 2, revision: 1, name: 'VLANs', description: 'VLANs regionais', color: '#4f7cff', scope: 'vlan' }],
    [3, { id: 3, revision: 1, name: 'Câmeras', description: 'Câmeras', color: '#20a57a', scope: 'camera' }],
    [4, { id: 4, revision: 1, name: 'Pontos', description: 'Pontos de clientes', color: '#8b5cf6', scope: 'point' }],
  ]);
  readonly records = new Map<number, StoredRecord>([
    [101, { id: 101, revision: 1, title: 'Rota existente', categoryId: 1, responsible: 'NOC', validation: '—', contact: '', notes: '', recordType: 'general', details: {} }],
  ]);
  private nextId = 200;
  failReads = false;

  async read(_query: CatalogQuery) {
    if (this.failReads) throw new Error('SQL SECRET internal driver details');
    return { categories: [...this.categories.values()], records: [...this.records.values()] };
  }

  async createCategory(data: CategoryCreateInput) {
    const id = this.nextId++;
    this.categories.set(id, { ...data, id, revision: 1 });
  }

  async updateCategory(data: CategoryUpdateInput) {
    const current = this.categories.get(data.id);
    if (!current) throw new DataStorageError('CATEGORY_NOT_FOUND_FOR_UPDATE');
    if ([...this.records.values()].some((record) => record.categoryId === data.id && record.recordType !== data.scope)) {
      throw new DataStorageError('CATEGORY_SCOPE_CONFLICT');
    }
    if (current.revision !== data.revision) throw new DataStorageError('REVISION_CONFLICT');
    this.categories.set(data.id, { ...data, revision: current.revision + 1 });
  }

  async createRecord(data: RecordCreateInput) {
    const category = this.categories.get(data.categoryId);
    if (!category) throw new DataStorageError('CATEGORY_NOT_FOUND');
    if (category.scope !== data.recordType) throw new DataStorageError('CATEGORY_SCOPE_MISMATCH');
    const id = this.nextId++;
    this.records.set(id, { ...data, id, revision: 1 });
  }

  async updateRecord(data: RecordUpdateInput) {
    const current = this.records.get(data.id);
    if (!current) throw new DataStorageError('RECORD_NOT_FOUND');
    if (current.revision !== data.revision) throw new DataStorageError('REVISION_CONFLICT');
    const category = this.categories.get(data.categoryId);
    if (!category) throw new DataStorageError('CATEGORY_NOT_FOUND_FOR_UPDATE');
    if (category.scope !== data.recordType) throw new DataStorageError('CATEGORY_SCOPE_MISMATCH');
    this.records.set(data.id, { ...data, revision: current.revision + 1 });
  }
}

function fixture() {
  const storage = new MemoryStorage();
  return { storage, api: createDataHandlers(storage, 1) };
}

function post(api: ReturnType<typeof createDataHandlers>, payload: unknown) {
  return api.POST(new Request('http://local/api/data', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  }));
}

function put(api: ReturnType<typeof createDataHandlers>, payload: unknown) {
  return api.PUT(new Request('http://local/api/data', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  }));
}

const category = { kind: 'category', name: 'Regional', description: 'Descrição longa o bastante para cadastro', color: '#abc123', scope: 'general' };
const recordPayloads = [
  { kind: 'record', recordType: 'general', recordKind: 'general', title: 'Linhares × Sooretama', categoryId: 1, responsible: 'NOC', validation: '—', contact: '', notes: '', details: {} },
  { kind: 'record', recordType: 'vlan', recordKind: 'vlan', title: 'VLAN 3333 — Centro', categoryId: 2, responsible: '', validation: '—', contact: '', notes: '', details: { vlanNumber: '3333', neighborhood: 'Centro' } },
  { kind: 'record', recordType: 'camera', recordKind: 'camera', title: 'Câmera 1', categoryId: 3, responsible: '', validation: '—', contact: '', notes: '', details: { camera: 'Câmera 1', neighborhood: 'Centro', address: 'Rua de teste', reference: '', geolocation: '', olt: '', description: 'Monitoramento', signal: '', serialNumber: '' } },
  { kind: 'record', recordType: 'point', recordKind: 'point', title: 'Filial Centro', categoryId: 4, responsible: '', validation: '—', contact: '', notes: '', details: { location: 'Filial Centro', address: 'Rua de teste', speed: '500 Mbps', date: '', partner: 'Cliente', ip: '' } },
];

void test('POST accepts the current category and all four record payloads', async () => {
  const { storage, api } = fixture();
  const categoryResult = await (await post(api, category)).json() as { operation: DataReceipt };
  assert.equal(categoryResult.operation.kind, 'category');
  assert.equal(categoryResult.operation.snapshot.name, 'Regional');
  assert.equal(categoryResult.operation.revision, 1);
  for (const payload of recordPayloads) {
    const response = await post(api, payload);
    assert.equal(response.status, 201);
  }
  assert.equal(storage.records.size, 5);
  assert.ok([...storage.records.values()].every((record) => record.revision === 1));
});

void test('accepts structured point and camera connectivity details and normalizes MAC addresses', async () => {
  const { storage, api } = fixture();
  const point = {
    ...recordPayloads[3],
    details: {
      ...recordPayloads[3].details,
      provider: 'Provedor de teste', dhcpInternal: 'Ativo', onu: 'Modelo X', onuIdentifier: 'ONU-123',
      olt: 'OLT-LIN-01', macAddress: 'aabb.ccdd.eeff', connectionPort: '1/2/3', opticalSignal: '-18.5 dBm',
      activationDate: '2026-10-08', installationTechnician: 'Técnico de teste',
    },
  };
  const camera = {
    ...recordPayloads[2],
    details: {
      ...recordPayloads[2].details,
      alternateIdentifier: 'CAM-PMS-ALT-1', ipAddress: '192.0.2.10', tunnelIp: '192.0.2.20',
      eoipId: '1050', onuIdentifier: 'ONU-456', vlanNumber: '105', macAddress: 'aa-bb-cc-dd-ee-ff',
    },
  };

  assert.equal((await post(api, point)).status, 201);
  assert.equal((await post(api, camera)).status, 201);
  assert.equal(storage.records.get(200)?.details.macAddress, 'AA:BB:CC:DD:EE:FF');
  assert.equal(storage.records.get(201)?.details.macAddress, 'AA:BB:CC:DD:EE:FF');
  assert.equal(storage.records.get(200)?.details.activationDate, '2026-10-08');
  assert.equal(storage.records.get(201)?.details.eoipId, '1050');
  assert.equal((await put(api, { ...point, id: 200, revision: 1, details: { ...point.details, provider: 'Provedor atualizado' } })).status, 200);
  assert.equal(storage.records.get(200)?.details.provider, 'Provedor atualizado');
});

void test('PUT accepts existing record and category edits', async () => {
  const { storage, api } = fixture();
  const updatedRecord = { ...recordPayloads[0], id: 101, revision: 1, title: 'Rota atualizada' };
  assert.equal((await put(api, updatedRecord)).status, 200);
  const updatedCategory = { kind: 'category', id: 2, revision: 1, name: 'VLANs', description: 'Escopo mantido', color: '#4f7cff', scope: 'vlan' };
  assert.equal((await put(api, updatedCategory)).status, 200);
  assert.equal(storage.records.get(101)?.title, 'Rota atualizada');
  assert.equal(storage.records.get(101)?.revision, 2);
  assert.equal(storage.categories.get(2)?.revision, 2);
});

void test('returns 409 for stale record and category revisions without overwriting newer data', async () => {
  const { api, storage } = fixture();
  const recordA = { ...recordPayloads[0], id: 101, revision: 1, title: 'Atualização A' };
  assert.equal((await put(api, recordA)).status, 200);
  const staleRecordResponse = await put(api, { ...recordPayloads[0], id: 101, revision: 1, title: 'Atualização B' });
  assert.equal(staleRecordResponse.status, 409);
  assert.deepEqual(await staleRecordResponse.json(), { error: 'Este registro foi alterado por outro usuário. Recarregue os dados e tente novamente.' });
  assert.equal(storage.records.get(101)?.title, 'Atualização A');
  assert.equal(storage.records.get(101)?.revision, 2);

  const categoryA = { kind: 'category', id: 1, revision: 1, name: 'Categoria A', description: 'Atualizada', color: '#ff6b2c', scope: 'general' };
  assert.equal((await put(api, categoryA)).status, 200);
  const staleCategoryResponse = await put(api, { ...categoryA, name: 'Categoria B' });
  assert.equal(staleCategoryResponse.status, 409);
  assert.deepEqual(await staleCategoryResponse.json(), { error: 'Este registro foi alterado por outro usuário. Recarregue os dados e tente novamente.' });
  assert.equal(storage.categories.get(1)?.name, 'Categoria A');
  assert.equal(storage.categories.get(1)?.revision, 2);
});

void test('rejects empty, malformed JSON, null, arrays, and oversized request bodies', async () => {
  const { api } = fixture();
  assert.equal((await api.POST(new Request('http://local/api/data', { method: 'POST' }))).status, 400);
  assert.equal((await post(api, '')).status, 400);
  assert.equal((await post(api, '{')).status, 400);
  assert.equal((await post(api, null)).status, 400);
  assert.equal((await post(api, [])).status, 400);
  const huge = JSON.stringify({ kind: 'category', name: 'x'.repeat(70_000) });
  assert.equal((await post(api, huge)).status, 413);
});

void test('rejects unknown operation, unknown fields, wrong types, IDs, and scopes', async () => {
  const { api, storage } = fixture();
  const cases: unknown[] = [
    { kind: 'other' },
    { ...category, scope: 'other' },
    { ...category, color: { value: '#ffffff' } },
    { ...category, name: null },
    { ...category, extra: true },
    { ...recordPayloads[0], categoryId: '1' },
    { ...recordPayloads[0], categoryId: null },
    { ...recordPayloads[0], recordType: 'unknown' },
    { ...recordPayloads[0], recordKind: 'vlan' },
    { ...recordPayloads[0], details: [] },
    { ...recordPayloads[0], details: { attackerControlled: 'x' } },
    { ...recordPayloads[0], notes: 'senha=[OMITIDA]' },
    { ...recordPayloads[1], details: { vlanNumber: {}, neighborhood: 'Centro' } },
    { ...recordPayloads[1], title: 'Título divergente' },
    { ...recordPayloads[0], title: ['Rota'] },
    { kind: 'record', recordType: 'general', title: 'Sem id', categoryId: 1, details: {}, id: '101' },
    { kind: 'category', name: 'Revision inválida', description: 'Teste', color: '#123456', scope: 'general', revision: 1 },
  ];
  for (const payload of cases) assert.equal((await post(api, payload)).status, 400);
  assert.equal(storage.records.size, 1);
});

void test('rejects missing required values and invalid dates', async () => {
  const { api } = fixture();
  assert.equal((await post(api, { ...category, name: ' ' })).status, 400);
  assert.equal((await post(api, { ...recordPayloads[0], responsible: '' })).status, 400);
  assert.equal((await post(api, { ...recordPayloads[1], details: { vlanNumber: '1' } })).status, 400);
  assert.equal((await post(api, { ...recordPayloads[3], details: { ...recordPayloads[3].details, date: '2026-02-30' } })).status, 400);
  assert.equal((await post(api, { ...recordPayloads[3], details: { ...recordPayloads[3].details, activationDate: '2026-02-30' } })).status, 400);
});

void test('validates new IP, MAC, VLAN and optical signal fields', async () => {
  const { api } = fixture();
  const invalidCameraDetails = [
    { ipAddress: '999.1.1.1' },
    { tunnelIp: '192.0.2' },
    { vlanNumber: '4095' },
    { macAddress: 'AA:BB:CC:DD:EE' },
  ];
  for (const invalid of invalidCameraDetails) {
    assert.equal((await post(api, { ...recordPayloads[2], details: { ...recordPayloads[2].details, ...invalid } })).status, 400);
  }
  assert.equal((await post(api, { ...recordPayloads[3], details: { ...recordPayloads[3].details, macAddress: 'not-a-mac' } })).status, 400);
  assert.equal((await post(api, { ...recordPayloads[3], details: { ...recordPayloads[3].details, opticalSignal: 'forte' } })).status, 400);
});

void test('rejects records with missing or incompatible categories', async () => {
  const { api, storage } = fixture();
  assert.equal((await post(api, { ...recordPayloads[0], categoryId: 999 })).status, 400);
  assert.equal((await post(api, { ...recordPayloads[1], categoryId: 1 })).status, 400);
  assert.equal(storage.records.size, 1);
});

void test('rejects changing category scope when a linked record would become incompatible', async () => {
  const { api, storage } = fixture();
  const response = await put(api, { kind: 'category', id: 1, revision: 1, name: 'Rotas', description: 'Alteração indevida', color: '#ff6b2c', scope: 'vlan' });
  assert.equal(response.status, 400);
  assert.match((await response.json() as { error: string }).error, /registros vinculados incompatíveis/i);
  assert.equal(storage.categories.get(1)?.scope, 'general');
});

void test('allows category scope updates with no incompatible linked records', async () => {
  const { api, storage } = fixture();
  const response = await put(api, { kind: 'category', id: 2, revision: 1, name: 'VLANs ajustadas', description: 'Categoria sem registros vinculados', color: '#4f7cff', scope: 'camera' });
  assert.equal(response.status, 200);
  assert.equal(storage.categories.get(2)?.scope, 'camera');
});

void test('returns 404 for nonexistent category and record updates', async () => {
  const { api } = fixture();
  assert.equal((await put(api, { ...category, id: 999, revision: 1 })).status, 404);
  assert.equal((await put(api, { ...recordPayloads[0], id: 999, revision: 1 })).status, 404);
  assert.equal((await put(api, { ...category })).status, 400);
  assert.equal((await put(api, { ...recordPayloads[0] })).status, 400);
  assert.equal((await put(api, { ...recordPayloads[0], id: 101 })).status, 400);
  assert.equal((await put(api, { ...category, id: 1 })).status, 400);
  assert.equal((await put(api, { ...category, id: 1, revision: 0 })).status, 400);
  assert.equal((await put(api, { ...recordPayloads[0], id: 101, revision: 1.5 })).status, 400);
});

void test('preserves safe error responses and does not expose internal storage details', async () => {
  const { api, storage } = fixture();
  storage.failReads = true;
  const getResponse = await api.GET(new Request('http://local/api/data?resource=records'));
  assert.equal(getResponse.status, 500);
  assert.deepEqual(await getResponse.json(), { error: 'Falha ao carregar dados.' });
  storage.failReads = false;
  storage.createCategory = async () => { throw new Error('SQL SECRET raw driver details'); };
  const response = await post(api, category);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'Falha ao salvar os dados. Resultado não confirmado.' });
});
