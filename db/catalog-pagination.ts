import { DataStorageError } from './data-errors.ts';
import { recordKinds, type RecordDetails, type RecordKind } from './data-types.ts';

export type CatalogKind = RecordKind;
export type CatalogQuery =
  | { resource: 'records'; page: number; pageSize: number; q: string; kind?: CatalogKind; categoryId?: number }
  | { resource: 'routes'; page: number; pageSize: number; q: string; kind: 'general' }
  | { resource: 'categories'; page: number; pageSize: number; q: string; scope?: CatalogKind }
  | { resource: 'summary' }
  | { resource: 'record'; id: number }
  | { resource: 'category'; id: number };

export class CatalogQueryError extends Error {
  constructor(message: string) { super(message); this.name = 'CatalogQueryError'; }
}

const kinds = new Set<CatalogKind>(recordKinds);
const allowed: Record<CatalogQuery['resource'], Set<string>> = {
  records: new Set(['resource', 'page', 'pageSize', 'q', 'kind', 'categoryId']),
  routes: new Set(['resource', 'page', 'pageSize', 'q']),
  categories: new Set(['resource', 'page', 'pageSize', 'q', 'scope']),
  summary: new Set(['resource']),
  record: new Set(['resource', 'id']),
  category: new Set(['resource', 'id']),
};

function integer(value: string | null, fallback: number, max: number): number {
  if (value === null) return fallback;
  if (!/^[1-9]\d*$/.test(value)) throw new CatalogQueryError('Parâmetro numérico inválido.');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number > max) throw new CatalogQueryError('Parâmetro numérico fora do limite.');
  return number;
}

function kind(value: string | null): CatalogKind | undefined {
  if (!value) return undefined;
  if (!kinds.has(value as CatalogKind)) throw new CatalogQueryError('Tipo de cadastro inválido.');
  return value as CatalogKind;
}

export function parseCatalogQuery(params: URLSearchParams): CatalogQuery {
  const resource = params.get('resource') as CatalogQuery['resource'] | null;
  if (!resource || !Object.hasOwn(allowed, resource)) throw new CatalogQueryError('Informe uma consulta cadastral válida.');
  for (const key of params.keys()) {
    if (!allowed[resource].has(key) || params.getAll(key).length !== 1) throw new CatalogQueryError('Parâmetro de consulta inválido.');
  }
  if (resource === 'summary') return { resource };
  if (resource === 'record' || resource === 'category') return { resource, id: integer(params.get('id'), 0, Number.MAX_SAFE_INTEGER) };
  const page = integer(params.get('page'), 1, 100000);
  const pageSize = integer(params.get('pageSize'), 20, 100);
  const q = (params.get('q') ?? '').trim();
  if (q.length > 160) throw new CatalogQueryError('Pesquisa inválida ou muito longa.');
  for (const letter of q) {
    const code = letter.codePointAt(0)!;
    if (code < 32 || code === 127) throw new CatalogQueryError('Pesquisa inválida ou muito longa.');
  }
  if (resource === 'categories') return { resource, page, pageSize, q, scope: kind(params.get('scope')) };
  if (resource === 'routes') return { resource, page, pageSize, q, kind: 'general' };
  return { resource, page, pageSize, q, kind: kind(params.get('kind')), categoryId: params.has('categoryId') ? integer(params.get('categoryId'), 0, Number.MAX_SAFE_INTEGER) : undefined };
}

function missingSchema(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 3 && current instanceof Error; depth++) {
    if (/\bno such (?:table|column)\b|\bno column named\b/i.test(current.message)) return true;
    current = current.cause;
  }
  return false;
}

function searchPattern(q: string): string {
  return `%${q.toLocaleLowerCase('pt-BR').replace(/[\\%_]/g, '\\$&')}%`;
}

function folded(column: string): string {
  let result = `lower(${column})`;
  for (const [upper, lower] of [['Á','á'],['À','à'],['Â','â'],['Ã','ã'],['Ä','ä'],['É','é'],['Ê','ê'],['Í','í'],['Ó','ó'],['Ô','ô'],['Õ','õ'],['Ö','ö'],['Ú','ú'],['Ü','ü'],['Ç','ç']])
    result = `replace(${result}, '${upper}', '${lower}')`;
  return result;
}

function pageInfo(total: number, page: number, pageSize: number) {
  return { total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

function recordRow(row: Record<string, unknown>) {
  let details: RecordDetails = {};
  try {
    const parsed: unknown = JSON.parse(typeof row.detailsJson === 'string' ? row.detailsJson : '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      details = Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  } catch { /* Preserve the legacy behavior for malformed details. */ }
  const { detailsJson: _detailsJson, ...record } = row;
  return { ...record, details };
}

const recordColumns = `i.id, i.title, i.category_id AS categoryId, i.responsible, i.validation, i.contact, i.notes, i.kind, i.details_json AS detailsJson, i.revision, CASE WHEN datetime(i.updated_at) >= datetime('now', '-1 day') THEN 'Hoje' ELSE substr(i.updated_at, 1, 10) END AS updated, c.name AS categoryName, c.color AS categoryColor`;

async function readPage(db: D1Database, countSql: string, dataSql: string, bindings: (string | number)[], page: number, pageSize: number) {
  const [count, data] = await db.batch([
    db.prepare(countSql).bind(...bindings),
    db.prepare(dataSql).bind(...bindings, pageSize, (page - 1) * pageSize),
  ]);
  const total = Number((count.results[0] as { total: number } | undefined)?.total ?? 0);
  return { rows: data.results as Record<string, unknown>[], ...pageInfo(total, page, pageSize) };
}

export async function queryCatalog(db: D1Database, query: CatalogQuery) {
  try {
    if (query.resource === 'summary') {
      const [counts, categories, recent] = await db.batch([
        db.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN kind='general' THEN 1 ELSE 0 END) AS general, SUM(CASE WHEN kind='vlan' THEN 1 ELSE 0 END) AS vlan, SUM(CASE WHEN kind='camera' THEN 1 ELSE 0 END) AS camera, SUM(CASE WHEN kind='point' THEN 1 ELSE 0 END) AS point FROM information`),
        db.prepare('SELECT COUNT(*) AS total FROM categories'),
        db.prepare(`SELECT ${recordColumns} FROM information i LEFT JOIN categories c ON c.id=i.category_id ORDER BY i.updated_at DESC, i.id DESC LIMIT 8`),
      ]);
      const row = counts.results[0] as Record<string, number | null>;
      return { counts: { general: Number(row.general ?? 0), vlan: Number(row.vlan ?? 0), camera: Number(row.camera ?? 0), point: Number(row.point ?? 0), categories: Number((categories.results[0] as { total: number }).total) }, recent: recent.results.map((item) => recordRow(item as Record<string, unknown>)) };
    }
    if (query.resource === 'record') {
      const row = await db.prepare(`SELECT ${recordColumns} FROM information i LEFT JOIN categories c ON c.id=i.category_id WHERE i.id=?`).bind(query.id).first<Record<string, unknown>>();
      return { record: row ? recordRow(row) : null };
    }
    if (query.resource === 'category') {
      const row = await db.prepare('SELECT c.id,c.name,c.description,c.color,c.scope,c.revision,(SELECT COUNT(*) FROM information i WHERE i.category_id=c.id) AS recordCount FROM categories c WHERE c.id=?').bind(query.id).first();
      return { category: row ?? null };
    }
    if (query.resource === 'categories') {
      const conditions: string[] = [];
      const binds: (string | number)[] = [];
      if (query.scope) { conditions.push('c.scope=?'); binds.push(query.scope); }
      if (query.q) { conditions.push(`${folded("coalesce(c.name,'')||' '||coalesce(c.description,'')")} LIKE ? ESCAPE '\\'`); binds.push(searchPattern(query.q)); }
      const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
      const page = await readPage(db,
        `SELECT COUNT(*) AS total FROM categories c${where}`,
        `SELECT c.id,c.name,c.description,c.color,c.scope,c.revision,(SELECT COUNT(*) FROM information i WHERE i.category_id=c.id) AS recordCount FROM categories c${where} ORDER BY c.created_at ASC,c.id ASC LIMIT ? OFFSET ?`,
        binds, query.page, query.pageSize);
      return { categories: page.rows, total: page.total, page: page.page, pageSize: page.pageSize, pages: page.pages };
    }
    const conditions: string[] = [];
    const binds: (string | number)[] = [];
    if (query.kind) { conditions.push('i.kind=?'); binds.push(query.kind); }
    if (query.resource === 'records' && query.categoryId) { conditions.push('i.category_id=?'); binds.push(query.categoryId); }
    if (query.q) {
      const text = query.resource === 'routes'
        ? "coalesce(i.title,'')"
        : "coalesce(i.title,'')||' '||coalesce(i.responsible,'')||' '||coalesce(i.validation,'')||' '||coalesce(i.contact,'')||' '||coalesce(i.notes,'')||' '||coalesce(c.name,'')||' '||coalesce(i.details_json,'')";
      conditions.push(`${folded(text)} LIKE ? ESCAPE '\\'`);
      binds.push(searchPattern(query.q));
    }
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    const from = ' FROM information i LEFT JOIN categories c ON c.id=i.category_id';
    const columns = query.resource === 'routes' ? 'i.id,i.title' : recordColumns;
    const page = await readPage(db,
      `SELECT COUNT(*) AS total${from}${where}`,
      `SELECT ${columns}${from}${where} ORDER BY i.updated_at DESC,i.id DESC LIMIT ? OFFSET ?`,
      binds, query.page, query.pageSize);
    return query.resource === 'routes'
      ? { routes: page.rows, total: page.total, page: page.page, pageSize: page.pageSize, pages: page.pages }
      : { records: page.rows.map(recordRow), total: page.total, page: page.page, pageSize: page.pageSize, pages: page.pages };
  } catch (error) {
    if (missingSchema(error)) throw new DataStorageError('SCHEMA_OUTDATED');
    throw error;
  }
}
