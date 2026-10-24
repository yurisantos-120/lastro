import { env } from 'cloudflare:workers';
import { DataOperations } from './data-operations';
import { queryCatalog, type CatalogQuery } from './catalog-pagination';

function database() {
  if (!env.DB) throw new Error('Banco de dados DB indisponível.');
  return env.DB;
}

export function dataOperationStore() { return new DataOperations(database()); }

export async function readCatalogQuery(query: CatalogQuery) { return queryCatalog(database(), query); }
