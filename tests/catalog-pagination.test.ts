import assert from 'node:assert/strict';
import test from 'node:test';
import { D1Memory } from './helpers/d1-memory.ts';
import { CatalogQueryError, parseCatalogQuery, queryCatalog } from '../db/catalog-pagination.ts';
import { createDataHandlers } from '../app/api/data/handlers.ts';
import { withRequiredRole } from '../services/auth/api-access.ts';
import type { AuthUser } from '../services/auth/auth-types.ts';

type Page<T> = { total: number; page: number; pageSize: number; pages: number; records?: T[]; categories?: T[]; routes?: T[] };
type Item = { id: number; title: string; categoryId: number; categoryName: string; details: Record<string, string> };
const date = '2026-10-20T10:00:00.000Z';

function fixture() {
  const h = new D1Memory();
  const category = h.sqlite.prepare('INSERT INTO categories(id,name,description,color,scope,revision,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?)');
  category.run(1, 'Rotas Árvore', 'Fibra', '#112233', 'general', date, date);
  category.run(2, 'Rotas Sul', 'Região', '#334455', 'general', date, date);
  category.run(3, 'VLANs', 'Rede', '#556677', 'vlan', date, date);
  const insert = h.sqlite.prepare('INSERT INTO information(id,title,category_id,responsible,validation,contact,notes,kind,details_json,revision,updated_at) VALUES(?,?,?,?,?,?,?,?,?,1,?)');
  for (let id = 1; id <= 45; id++) insert.run(id, `Rota ${id}`, id % 2 ? 1 : 2, 'NOC', 'validada', '', '', 'general', '{}', date);
  for (let id = 46; id <= 50; id++) insert.run(id, `VLAN ${id}`, 3, '', '—', '', '', 'vlan', '{}', date);
  insert.run(51, 'Árvore 100%_', 2, 'NOC', 'validada', '', '', 'general', '{"neighborhood":"Centro"}', date);
  return h;
}

async function list<T>(h: D1Memory, input: string): Promise<Page<T>> {
  return await queryCatalog(h.asD1(), parseCatalogQuery(new URLSearchParams(input))) as Page<T>;
}

void test('first, middle and last pages have stable order, bounds and totals on current migrations', async () => {
  const h = fixture();
  try {
    const sql: string[] = [];
    h.beforeRun = (statement) => sql.push(statement);
    const first = await list<Item>(h, 'resource=records&page=1&pageSize=20');
    const middle = await list<Item>(h, 'resource=records&page=2&pageSize=20');
    const last = await list<Item>(h, 'resource=records&page=3&pageSize=20');
    assert.deepEqual([first.total, first.pages, first.records?.length, middle.records?.length, last.records?.length], [51, 3, 20, 20, 11]);
    assert.deepEqual(first.records?.map((item) => item.id), Array.from({ length: 20 }, (_, index) => 51 - index));
    assert.deepEqual(last.records?.map((item) => item.id), Array.from({ length: 11 }, (_, index) => 11 - index));
    assert.ok(sql.some((statement) => /LIMIT \? OFFSET \?/i.test(statement)));
    assert.ok(sql.every((statement) => /^SELECT\b/i.test(statement)));
    assert.equal(h.sqlite.prepare('SELECT COUNT(*) AS n FROM information').get()?.n, 51);
  } finally { h.sqlite.close(); }
});

void test('server applies type, category and escaped text filters before pagination', async () => {
  const h = fixture();
  try {
    const filtered = await list<Item>(h, 'resource=records&kind=general&categoryId=2&q=ROTA&pageSize=10');
    assert.equal(filtered.total, 23);
    assert.equal(filtered.records?.length, 10);
    assert.ok(filtered.records?.every((item) => item.categoryId === 2));
    const byCategoryName = await list<Item>(h, 'resource=records&q=%C3%81RVORE&pageSize=100');
    assert.ok((byCategoryName.records?.length ?? 0) > 0);
    assert.ok(byCategoryName.records?.some((item) => item.id === 51));
    const literal = await list<Item>(h, 'resource=records&q=100%25_');
    assert.deepEqual(literal.records?.map((item) => item.id), [51]);
    const details = await list<Item>(h, 'resource=records&q=centro');
    assert.deepEqual(details.records?.map((item) => item.id), [51]);
  } finally { h.sqlite.close(); }
});

void test('categories and route selectors are bounded, searchable and report linked counts', async () => {
  const h = fixture();
  try {
    const categories = await list<{ id: number; recordCount: number }>(h, 'resource=categories&scope=general&pageSize=1&page=2');
    assert.equal(categories.total, 2);
    assert.equal(categories.pages, 2);
    assert.deepEqual(categories.categories?.map((item) => [item.id, item.recordCount]), [[2, 23]]);
    const routes = await list<{ id: number; title: string }>(h, 'resource=routes&q=rota%204&pageSize=5');
    assert.equal(routes.total, 7);
    assert.equal(routes.routes?.length, 5);
    assert.ok(routes.routes?.every((route) => route.title.startsWith('Rota 4')));
    const single = await queryCatalog(h.asD1(), parseCatalogQuery(new URLSearchParams('resource=record&id=51'))) as { record: Item };
    assert.equal(single.record.categoryName, 'Rotas Sul');
  } finally { h.sqlite.close(); }
});

void test('new rows and edits change subsequent totals and deterministic order without stale cache', async () => {
  const h = fixture();
  try {
    const before = await list<Item>(h, 'resource=records&pageSize=10');
    assert.equal(before.total, 51);
    h.sqlite.prepare('INSERT INTO information(id,title,category_id,responsible,validation,contact,notes,kind,details_json,revision,updated_at) VALUES(52,?,?,?,?,?,?,?, ?,1,?)')
      .run('Nova rota', 1, 'NOC', '—', '', '', 'general', '{}', '2026-10-21T11:00:00.000Z');
    const after = await list<Item>(h, 'resource=records&pageSize=10');
    assert.equal(after.total, 52);
    assert.equal(after.records?.[0].id, 52);
    h.sqlite.prepare('UPDATE information SET updated_at=?,title=? WHERE id=1').run('2026-10-22T11:00:00.000Z', 'Rota editada');
    const edited = await list<Item>(h, 'resource=records&pageSize=10');
    assert.deepEqual(edited.records?.slice(0, 2).map((item) => item.id), [1, 52]);
  } finally { h.sqlite.close(); }
});

void test('invalid limits, unknown resources and duplicate filters are rejected before querying', async () => {
  for (const input of ['','resource=records&page=0','resource=records&pageSize=101','resource=records&page=-1','resource=records&kind=other','resource=records&categoryId=0','resource=records&q=x&q=y','resource=summary&page=2','resource=record&id=abc'])
    assert.throws(() => parseCatalogQuery(new URLSearchParams(input)), CatalogQueryError);
  const h = fixture();
  try {
    const api = createDataHandlers({ read: (query) => queryCatalog(h.asD1(), query), execute: async () => { throw new Error('unused'); }, recover: async () => null }, 1);
    const invalid = await api.GET(new Request('http://local/api/data?resource=records&pageSize=1000'));
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json() as { code: string }).code, 'INVALID_CATALOG_QUERY');
    const request = new Request('http://local/api/data?resource=records', { headers: { cookie: `opuslog_session=${'x'.repeat(43)}` } });
    let reads = 0;
    const anonymous = await withRequiredRole(request, 'viewer', async () => null, () => { reads++; return api.GET(request); });
    assert.equal(anonymous.status, 401);
    assert.equal(reads, 0);
    const viewer = { id: 1, active: true, role: 'viewer' } as AuthUser;
    const allowed = await withRequiredRole(request, 'viewer', async () => viewer, () => { reads++; return api.GET(request); });
    assert.equal(allowed.status, 200);
    assert.equal(reads, 1);
  } finally { h.sqlite.close(); }
});
