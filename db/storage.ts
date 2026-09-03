import { env } from 'cloudflare:workers';

const categorySeeds = [
  [1, 'Trechos de fibra', 'Responsáveis, parceiros e contatos para atuação em rotas de fibra.', '#ff6b2c'],
  [2, 'DWDM ativo', 'Rotas DWDM, designações, proteção e orientações de validação.', '#4f7cff'],
  [3, 'Procedimentos', 'Orientações operacionais e sequências de acionamento do NOC.', '#20a57a'],
] as const;
const recordSeeds = [
  [1, 'Linhares (LNI) × Planalto (PNT)', 1, 'Megalink — Projetos', '—', 'Grupo Parceria ARC / Megalink', 'Atuação 24 horas por dia, 7 dias por semana.'],
  [2, 'São Mateus × Pontal', 2, 'Megalink', 'Validar canais de terceiros', 'NOC Megalink', 'Dinâmica e Tuddo utilizam canal neste trecho.'],
  [3, 'Pinheiros × Nova Venécia', 1, 'Megalink — João / RG Provider', '—', 'João — WhatsApp e ligação', 'Atendimento 24 horas.'],
  [4, 'Serra (VTA) × Campos', 2, 'Windex / Alta Rede', 'SEA_CPS-LBD-25000051', 'Grupos operacionais', 'Uma rota Windex e duas rotas Alta Rede.'],
  [5, 'Linhares × Sooretama', 1, 'Megalink — Projetos', '—', 'WhatsApp / ligação', 'Horário de atuação 24h/7d.'],
] as const;

function database() {
  if (!env.DB) throw new Error('Banco de dados DB indisponível.');
  return env.DB;
}

export async function ensureDatabase() {
  const db = database();
  const count = await db.prepare('SELECT COUNT(*) AS total FROM categories').first<{ total: number }>();
  if (!count?.total) {
    const now = new Date().toISOString();
    await db.batch(categorySeeds.map((x) => db.prepare('INSERT INTO categories (id, name, description, color, scope, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(...x, 'general', now, now)));
    await db.batch(recordSeeds.map((x) => db.prepare('INSERT INTO information (id, title, category_id, responsible, validation, contact, notes, kind, details_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(...x, 'general', '{}', now)));
    await db.prepare('PRAGMA optimize').run();
  }
}

export async function readAll() {
  await ensureDatabase();
  const db = database();
  const [categories, records] = await Promise.all([
    db.prepare('SELECT id, name, description, color, scope FROM categories ORDER BY created_at ASC').all(),
    db.prepare(`SELECT id, title, category_id AS categoryId, responsible, validation, contact, notes, kind, details_json AS detailsJson, CASE WHEN datetime(updated_at) >= datetime('now', '-1 day') THEN 'Hoje' ELSE substr(updated_at, 1, 10) END AS updated FROM information ORDER BY updated_at DESC`).all(),
  ]);
  const normalizedRecords = records.results.map((row) => {
    const item = row as Record<string, unknown>;
    let details: Record<string, string> = {};
    try { details = JSON.parse(String(item.detailsJson || '{}')) as Record<string, string>; } catch { details = {}; }
    const { detailsJson: _detailsJson, ...record } = item;
    return { ...record, details };
  });
  return { categories: categories.results, records: normalizedRecords };
}

export async function createCategory(data: Record<string, unknown>) {
  await ensureDatabase(); const id = Date.now(); const now = new Date().toISOString();
  await database().prepare('INSERT INTO categories (id, name, description, color, scope, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, data.name, data.description, data.color, data.scope || 'general', now, now).run();
}

export async function updateCategory(data: Record<string, unknown>) {
  await ensureDatabase();
  await database().prepare('UPDATE categories SET name = ?, description = ?, color = ?, scope = ?, updated_at = ? WHERE id = ?').bind(data.name, data.description, data.color, data.scope || 'general', new Date().toISOString(), data.id).run();
}

export async function createRecord(data: Record<string, unknown>) {
  await ensureDatabase(); const id = Date.now();
  await database().prepare('INSERT INTO information (id, title, category_id, responsible, validation, contact, notes, kind, details_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, data.title, data.categoryId, data.responsible || '', data.validation || '—', data.contact || '', data.notes || '', data.recordType || 'general', JSON.stringify(data.details || {}), new Date().toISOString()).run();
}

export async function updateRecord(data: Record<string, unknown>) {
  await ensureDatabase();
  await database().prepare('UPDATE information SET title = ?, category_id = ?, responsible = ?, validation = ?, contact = ?, notes = ?, kind = ?, details_json = ?, updated_at = ? WHERE id = ?').bind(data.title, data.categoryId, data.responsible || '', data.validation || '—', data.contact || '', data.notes || '', data.recordType || 'general', JSON.stringify(data.details || {}), new Date().toISOString(), data.id).run();
}
