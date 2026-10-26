import assert from 'node:assert/strict';
import test from 'node:test';
import { D1Memory } from './helpers/d1-memory.ts';
import { validatePayload } from '../app/api/data/validation.ts';
import { DataOperations } from '../db/data-operations.ts';
import { parseCatalogQuery, queryCatalog, CatalogQueryError } from '../db/catalog-pagination.ts';

const point = (location: string, dimensions: Record<string, string | undefined> = {}) => ({
  kind: 'record', recordType: 'point', title: location, categoryId: 1, responsible: '',
  details: { location, partner: 'Parceiro sintético', address: 'Endereço sintético', ...dimensions },
});

function fixture() {
  const h = new D1Memory();
  h.sqlite.exec(`INSERT INTO users(id,glpi_user_id,name,username,role,active,created_at,updated_at) VALUES
    (1,11,'Operador','op','operator',1,'2026-10-24','2026-10-24'),
    (2,12,'Visualização','viewer','viewer',1,'2026-10-24','2026-10-24');
    INSERT INTO categories(id,name,description,color,scope,created_at,updated_at) VALUES
    (1,'Pontos','Categoria sintética','#123456','point','2026-10-24','2026-10-24'),
    (2,'Rotas','Categoria sintética','#654321','general','2026-10-24','2026-10-24');`);
  return { h, store: new DataOperations(h.asD1()) };
}

async function page(h: D1Memory, query: string) {
  return await queryCatalog(h.asD1(), parseCatalogQuery(new URLSearchParams(query))) as unknown as {
    total: number; page: number; pages: number; records: Array<{ id: number; kind: string; details: Record<string, string | undefined> }>;
  };
}

void test('point dimensions are explicit, normalized for search, and reject sensitive values', () => {
  const parsed = validatePayload(point('Ponto 1', { municipality: '  São  Miguel  ', client: 'Prefeitura Municipal', operationalRegion: 'Região Norte' }), 'POST');
  assert.equal(parsed.kind, 'record');
  if (parsed.kind === 'record') {
    assert.equal(parsed.data.details.municipality, 'São Miguel');
    assert.equal(parsed.data.details.municipalityKey, undefined);
  }
  for (const details of [
    { municipality: 'contato@exemplo.com' },
    { client: 'token=segredo' },
    { operationalRegion: '198.51.100.9' },
    { client: '11987654321' },
    { municipality: 'Cidade\nOutra' },
    { municipality: 'x'.repeat(161) },
    { municipalityKey: 'forjado' },
  ]) assert.throws(() => validatePayload(point('Ponto 1', details), 'POST'));
  assert.throws(() => validatePayload({ kind: 'record', recordType: 'general', title: 'Rota', categoryId: 2, responsible: 'NOC', details: { client: 'Outro' } }, 'POST'));
});

void test('failed point confirmation rolls back dimensions and retains the original intent key', async () => {
  const { h, store } = fixture();
  try {
    const key = crypto.randomUUID();
    const payload = validatePayload(point('Ponto com falha', { municipality: 'Cidade de Teste', client: 'Cliente Institucional' }), 'POST');
    h.beforeRun = (sql) => { if (sql.startsWith('UPDATE data_operations')) throw new Error('Simulated receipt failure'); };
    await assert.rejects(store.execute(1, key, 'POST', payload));
    assert.equal(h.sqlite.prepare('SELECT COUNT(*) AS n FROM information').get()!.n, 0);
    assert.equal(await store.recover(1, key), null);
    await assert.rejects(store.execute(1, key, 'POST', validatePayload(point('Outra intenção'), 'POST')), { code: 'OPERATION_KEY_CONFLICT' });
    h.beforeRun = null;
    await store.execute(1, key, 'POST', payload);
    assert.equal(h.sqlite.prepare('SELECT COUNT(*) AS n FROM information').get()!.n, 1);
  } finally { h.sqlite.close(); }
});

void test('point creation, editing, replay, recovery and revision conflict keep one record', async () => {
  const { h, store } = fixture();
  try {
    const first = validatePayload(point('Ponto 1', { municipality: 'Santa Maria de Jetibá', client: 'Cliente Institucional', operationalRegion: 'Região Serrana' }), 'POST');
    const key = crypto.randomUUID();
    const created = await store.execute(1, key, 'POST', first);
    assert.deepEqual(await store.execute(1, key, 'POST', first), created);
    assert.deepEqual(await store.recover(1, key), created);
    assert.equal(h.sqlite.prepare('SELECT COUNT(*) AS n FROM information').get()!.n, 1);
    const stored = JSON.parse(h.sqlite.prepare('SELECT details_json FROM information WHERE id=?').get(created.entityId)!.details_json as string) as Record<string, string>;
    assert.equal(stored.municipalityKey, 'santa maria de jetiba');
    assert.equal(stored.clientKey, 'cliente institucional');
    assert.equal(stored.operationalRegionKey, 'regiao serrana');
    const edited = validatePayload({ ...point('Ponto 1', { municipality: 'Santa Maria de Jetibá', client: 'Cliente Institucional', operationalRegion: 'Região Sul' }), id: created.entityId, revision: 1 }, 'PUT');
    const editKey = crypto.randomUUID();
    const receipt = await store.execute(1, editKey, 'PUT', edited);
    assert.equal(receipt.revision, 2);
    assert.deepEqual(await store.execute(1, editKey, 'PUT', edited), receipt);
    await assert.rejects(store.execute(1, crypto.randomUUID(), 'PUT', edited), { code: 'REVISION_CONFLICT' });
    await assert.rejects(store.execute(1, editKey, 'PUT', validatePayload({ ...point('Ponto 1', { client: 'Outro' }), id: created.entityId, revision: 1 }, 'PUT')), { code: 'OPERATION_KEY_CONFLICT' });
    await assert.rejects(store.execute(2, crypto.randomUUID(), 'POST', first), { status: 403 });
    assert.equal(h.sqlite.prepare('SELECT COUNT(*) AS n FROM information').get()!.n, 1);
    assert.deepEqual(h.sqlite.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { h.sqlite.close(); }
});

void test('server combines point filters, search, category and pagination without duplicate rows', async () => {
  const { h } = fixture();
  try {
    const insert = h.sqlite.prepare('INSERT INTO information(id,title,category_id,responsible,validation,contact,notes,kind,details_json,revision,updated_at) VALUES(?,?,?,?,?,?,?,?,?,1,?)');
    for (let id = 1; id <= 26; id++) {
      const matching = id <= 23;
      const details = matching
        ? { location: `Ponto ${id}`, partner: 'Parceiro', address: 'Rua', municipality: 'São Miguel', municipalityKey: 'sao miguel', client: 'Cliente A', clientKey: 'cliente a', operationalRegion: 'Norte', operationalRegionKey: 'norte' }
        : { location: `Ponto ${id}`, partner: 'Parceiro', address: 'Rua', municipality: 'Outra Cidade', municipalityKey: 'outra cidade', client: 'Cliente B', clientKey: 'cliente b', operationalRegion: 'Sul', operationalRegionKey: 'sul' };
      insert.run(id, `Ponto ${id}`, 1, '', '—', '', '', 'point', JSON.stringify(details), '2026-10-24T12:00:00.000Z');
    }
    insert.run(27, 'Ponto antigo', 1, '', '—', '', '', 'point', JSON.stringify({ location: 'Ponto antigo', partner: 'Parceiro', address: 'Rua' }), '2026-10-24T12:00:00.000Z');
    insert.run(28, 'Rota', 2, 'NOC', '—', '', '', 'general', '{}', '2026-10-24T12:00:00.000Z');
    const filter = 'resource=records&kind=point&municipality=Sao&client=Cliente%20A&operationalRegion=Nor&categoryId=1&q=Ponto&pageSize=20';
    const first = await page(h, `${filter}&page=1`);
    const second = await page(h, `${filter}&page=2`);
    assert.deepEqual([first.total, first.pages, first.records.length, second.records.length], [23, 2, 20, 3]);
    assert.equal(new Set([...first.records, ...second.records].map((record) => record.id)).size, 23);
    assert.deepEqual(first.records.slice(0, 2).map((record) => record.id), [23, 22]);
    assert.equal((await page(h, 'resource=records&kind=point&municipality=Outra')).total, 3);
    assert.equal((await page(h, 'resource=records&kind=point&client=Cliente%20B')).total, 3);
    assert.equal((await page(h, 'resource=records&kind=point&operationalRegion=Sul')).total, 3);
    assert.equal((await page(h, 'resource=records&kind=point')).total, 27);
    assert.equal((await page(h, 'resource=records&kind=general')).total, 1);
    assert.equal((await page(h, 'resource=records&kind=point&q=antigo')).records[0].details.municipality, undefined);
    assert.equal(h.sqlite.prepare('SELECT COUNT(*) AS n FROM information').get()!.n, 28);
    const plan = h.sqlite.prepare("EXPLAIN QUERY PLAN SELECT id FROM information WHERE kind=? AND json_extract(details_json, '$.municipalityKey') >= ? AND json_extract(details_json, '$.municipalityKey') < ?")
      .all('point', 'sao', 'sao\u{10ffff}') as Array<{ detail: string }>;
    assert.ok(plan.some((row) => row.detail.includes('idx_information_point_municipality_key')));
  } finally { h.sqlite.close(); }
});

void test('invalid dimensions and attempts to filter other kinds are rejected before SQL', () => {
  for (const query of [
    'resource=records&municipality=Santa',
    'resource=records&kind=general&client=Cliente',
    'resource=records&kind=point&client=contato@exemplo.com',
    `resource=records&kind=point&municipality=${'a'.repeat(161)}`,
    'resource=records&kind=point&client=a&client=b',
  ]) assert.throws(() => parseCatalogQuery(new URLSearchParams(query)), CatalogQueryError);
});
