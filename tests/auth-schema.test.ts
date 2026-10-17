import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

const migrationFiles = readdirSync('drizzle')
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort();

function applyMigrations(db: DatabaseSync, files = migrationFiles) {
  for (const file of files) {
    const sql = readFileSync(`drizzle/${file}`, 'utf8').replaceAll('--> statement-breakpoint', '');
    db.exec(sql);
  }
}

function migration(name: string) {
  const found = migrationFiles.find((file) => file.startsWith(name));
  assert.ok(found, `Missing migration ${name}`);
  return found;
}

function requireRow<T>(row: T | undefined): T {
  assert.ok(row, 'Expected query to return a row');
  return row;
}

function createEquivalentCurrentDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  applyMigrations(db, migrationFiles.filter((file) => !file.startsWith('0005_') && !file.startsWith('0006_')));
  const insertCategory = db.prepare(
    `INSERT INTO categories (name, description, color, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)`,
  );
  const insertInformation = db.prepare(
    `INSERT INTO information (title, category_id, responsible, validation, contact, notes, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (let id = 1; id <= 7; id += 1) {
    insertCategory.run(`Categoria ${id}`, 'fixture', '#123456', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z');
    insertInformation.run(`Registro ${id}`, id, 'fixture', 'fixture', 'fixture', 'fixture', '2026-10-01T00:00:00.000Z');
  }
  db.prepare(
    `INSERT INTO tickets
      (operation_key, glpi_ticket_id, title, content, result_state, created_at, updated_at, created_by, revision)
      VALUES (?, ?, ?, ?, 'created', ?, ?, NULL, 5)`,
  ).run(
    '067ae2dc-438c-432c-89ed-d7d8cf6c7172',
    2021044572,
    '[OPUSLOG TESTE] Validação de criação de chamado',
    'Synthetic test content',
    '2026-10-07T19:02:14.792Z',
    '2026-10-07T19:25:01.650Z',
  );
  return db;
}

function insertUser(db: DatabaseSync, values: { glpiUserId: number; name: string; username: string; role?: string }) {
  return db.prepare(
    `INSERT INTO users (glpi_user_id, name, username, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    values.glpiUserId,
    values.name,
    values.username,
    values.role ?? 'viewer',
    '2026-10-07T00:00:00.000Z',
    '2026-10-07T00:00:00.000Z',
  );
}

void test('complete migrations create auth tables and persistent one-time bootstrap state on an empty database', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  try {
    applyMigrations(db);

    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
      .all()
      .map((row) => row.name);
    for (const table of ['categories', 'information', 'tickets', 'users', 'sessions', 'auth_bootstrap']) {
      assert.ok(tables.includes(table), `Expected table ${table}`);
    }

    const bootstrap = db.prepare('SELECT id, completed_at FROM auth_bootstrap').get();
    assert.deepEqual({ ...bootstrap }, { id: 1, completed_at: null });
    assert.equal(requireRow(db.prepare('SELECT COUNT(*) AS count FROM users').get()).count, 0);

    const userColumns = db.prepare('PRAGMA table_info(users)').all();
    assert.ok(userColumns.some((column) => column.name === 'glpi_user_id' && column.notnull === 1));
    assert.ok(!userColumns.some((column) => ['password_hash', 'password_reset_required'].includes(String(column.name))));
    assert.equal(requireRow(db.prepare('PRAGMA foreign_key_list(sessions)').get()).table, 'users');
    assert.equal(db.prepare('PRAGMA foreign_key_list(tickets)').all().length, 0);
  } finally {
    db.close();
  }
});

void test('users enforce GLPI identity, normalized unique usernames, local roles, defaults, and revision 1', () => {
  const db = new DatabaseSync(':memory:');
  try {
    applyMigrations(db);
    insertUser(db, { glpiUserId: 7001, name: 'Viewer User', username: 'viewer.one' });
    assert.deepEqual(
      { ...db.prepare('SELECT glpi_user_id, role, active, revision FROM users WHERE username = ?').get('viewer.one') },
      { glpi_user_id: 7001, role: 'viewer', active: 1, revision: 1 },
    );

    assert.throws(() => insertUser(db, { glpiUserId: 7002, name: 'Duplicate', username: 'viewer.one' }));
    assert.throws(() => insertUser(db, { glpiUserId: 7001, name: 'Duplicate GLPI identity', username: 'viewer.two' }));
    assert.throws(() => insertUser(db, { glpiUserId: 0, name: 'Invalid GLPI identity', username: 'invalid.id' }));
    assert.throws(() => insertUser(db, { glpiUserId: 7002, name: 'Not normalized', username: ' Viewer.Two ' }));
    assert.throws(() => insertUser(db, { glpiUserId: 7003, name: 'Not lowercase', username: 'Viewer.Three' }));
    assert.throws(() => db.prepare(
      `INSERT INTO users (glpi_user_id, name, username, role, created_at, updated_at)
        VALUES (7004, 'Invalid Role', 'invalid.role', 'superuser', 't', 't')`,
    ).run());
    assert.throws(() => db.prepare(
      `INSERT INTO users (name, username, created_at, updated_at)
        VALUES ('Missing GLPI identity', 'missing.id', 't', 't')`,
    ).run());
  } finally {
    db.close();
  }
});

void test('sessions require an existing user, unique token hashes, and support revocation', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  try {
    applyMigrations(db);
    insertUser(db, { glpiUserId: 7005, name: 'Operator', username: 'operator', role: 'operator' });
    const insertSession = db.prepare(
      `INSERT INTO sessions (user_id, token_hash, created_at, last_seen_at, expires_at)
        VALUES (?, ?, ?, ?, ?)`,
    );
    assert.throws(() => insertSession.run(999, 'hash-orphan', 't', 't', 't'));
    insertSession.run(1, 'unique-token-hash', 't', 't', '2099-01-01T00:00:00.000Z');
    assert.throws(() => insertSession.run(1, 'unique-token-hash', 't', 't', '2099-01-01T00:00:00.000Z'));
    db.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ?').run('2026-10-07T00:00:00.000Z', 'unique-token-hash');
    assert.equal(
      requireRow(db.prepare('SELECT revoked_at FROM sessions WHERE token_hash = ?').get('unique-token-hash')).revoked_at,
      '2026-10-07T00:00:00.000Z',
    );
    assert.throws(() => db.prepare('DELETE FROM users WHERE id = 1').run());
  } finally {
    db.close();
  }
});

void test('bootstrap completion remains persisted independently of current admin users', () => {
  const db = new DatabaseSync(':memory:');
  try {
    applyMigrations(db);
    db.prepare('UPDATE auth_bootstrap SET completed_at = ? WHERE id = 1').run('2026-10-07T00:00:00.000Z');
    insertUser(db, { glpiUserId: 7006, name: 'Admin', username: 'admin', role: 'admin' });
    db.prepare(`DELETE FROM users WHERE username = 'admin'`).run();
    assert.deepEqual({ ...db.prepare('SELECT id, completed_at FROM auth_bootstrap').get() }, {
      id: 1,
      completed_at: '2026-10-07T00:00:00.000Z',
    });
    assert.throws(() => db.prepare('INSERT INTO auth_bootstrap (id, completed_at) VALUES (2, NULL)').run());
  } finally {
    db.close();
  }
});

void test('0006 preserves an equivalent current database and legacy ticket authorship', () => {
  const db = createEquivalentCurrentDatabase();
  try {
    applyMigrations(db, [migration('0005_'), migration('0006_')]);
    assert.equal(requireRow(db.prepare('SELECT COUNT(*) AS count FROM categories').get()).count, 7);
    assert.equal(requireRow(db.prepare('SELECT COUNT(*) AS count FROM information').get()).count, 7);
    assert.equal(requireRow(db.prepare('SELECT COUNT(*) AS count FROM tickets').get()).count, 1);
    assert.deepEqual(
      { ...db.prepare('SELECT id, glpi_ticket_id, result_state, created_by, revision FROM tickets').get() },
      { id: 1, glpi_ticket_id: 2021044572, result_state: 'created', created_by: null, revision: 5 },
    );
    assert.equal(requireRow(db.prepare('SELECT COUNT(*) AS count FROM users').get()).count, 0);
    assert.equal(requireRow(db.prepare('SELECT COUNT(*) AS count FROM sessions').get()).count, 0);
    assert.equal(requireRow(db.prepare('SELECT completed_at FROM auth_bootstrap WHERE id = 1').get()).completed_at, null);
  } finally {
    db.close();
  }
});

void test('0006 fails closed and rolls back if legacy local users have no GLPI identity mapping', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  try {
    applyMigrations(db, migrationFiles.filter((file) => !file.startsWith('0006_')));
    db.prepare(
      `INSERT INTO users (name, username, password_hash, created_at, updated_at)
        VALUES ('Legacy User', 'legacy.user', 'legacy-hash', 't', 't')`,
    ).run();

    db.exec('BEGIN');
    assert.throws(() => applyMigrations(db, [migration('0006_')]));
    db.exec('ROLLBACK');

    assert.equal(requireRow(db.prepare('SELECT COUNT(*) AS count FROM users').get()).count, 1);
    assert.equal(requireRow(db.prepare('SELECT username FROM users WHERE id = 1').get()).username, 'legacy.user');
    assert.ok(db.prepare('PRAGMA table_info(users)').all().some((column) => column.name === 'password_hash'));
    assert.equal(requireRow(db.prepare('PRAGMA foreign_key_list(sessions)').get()).table, 'users');
  } finally {
    db.close();
  }
});
