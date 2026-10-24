// Offline validation only. Never opens the operational source named in manifest.
import assert from 'node:assert/strict';
import { DatabaseSync, backup } from 'node:sqlite';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

const [mode, rootArg] = process.argv.slice(2);
assert.ok(
  ['prepare', 'verify'].includes(mode) && rootArg,
  'Usage: node scripts/validate-homologation-copy.mjs prepare|verify BACKUP_DIRECTORY',
);
const root = realpathSync(rootArg);
const manifest = JSON.parse(
  readFileSync(join(root, 'manifest.json'), 'utf8').replace(/^\uFEFF/, ''),
);
assert.equal(manifest.kind, 'lastro-stage6-offline-raw-backup');
assert.equal(manifest.runtimeStopped, true);
assert.equal(manifest.exclusiveReadLocks, true);
assert.ok(
  !relative(resolve('.wrangler'), root)
    .split(sep)
    .every((part) => part !== '..'),
  'Backup must be outside operational persistence',
);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (value) =>
  JSON.stringify(value, (_key, item) =>
    typeof item === 'bigint' ? item.toString() : item,
  );
const write = (file, value) =>
  writeFileSync(join(root, file), JSON.stringify(value, null, 2) + '\n', {
    flag: 'wx',
  });
const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
const tables = (db) =>
  db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((row) => row.name);
function rowsDigest(db, table, columns) {
  const digest = createHash('sha256');
  for (const row of db
    .prepare(
      `SELECT ${columns.map(quote).join(',')} FROM ${quote(table)} ORDER BY ${columns.map(quote).join(',')}`,
    )
    .iterate())
    digest.update(json(row) + '\n');
  return digest.digest('hex');
}
function inspect(db) {
  const result = {
    sqliteVersion: db.prepare('SELECT sqlite_version() AS version').get()
      .version,
    journalMode: db.prepare('PRAGMA journal_mode').get().journal_mode,
    integrity: db.prepare('PRAGMA integrity_check').all(),
    foreignKeyViolations: db.prepare('PRAGMA foreign_key_check').all(),
    tables: {},
    objects: db
      .prepare(
        "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
      )
      .all(),
  };
  assert.deepEqual(
    result.integrity.map((row) => row.integrity_check),
    ['ok'],
  );
  assert.equal(result.foreignKeyViolations.length, 0);
  for (const table of tables(db)) {
    const columns = db.prepare(`PRAGMA table_info(${quote(table)})`).all();
    result.tables[table] = {
      count: Number(
        db.prepare(`SELECT count(*) AS n FROM ${quote(table)}`).get().n,
      ),
      columns,
      indexes: db
        .prepare(`PRAGMA index_list(${quote(table)})`)
        .all()
        .map((index) => ({
          ...index,
          columns: db.prepare(`PRAGMA index_xinfo(${quote(index.name)})`).all(),
        })),
      foreignKeys: db.prepare(`PRAGMA foreign_key_list(${quote(table)})`).all(),
      digest: rowsDigest(
        db,
        table,
        columns.map((column) => column.name),
      ),
    };
  }
  result.history = db.prepare('SELECT * FROM d1_migrations ORDER BY id').all();
  return result;
}
const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8'));
assert.deepEqual(
  journal.entries.map((entry) => entry.idx),
  Array.from({ length: 12 }, (_, index) => index),
);
const migrations = journal.entries.map((entry) => {
  const file = entry.tag + '.sql';
  assert.ok(existsSync(join('drizzle', file)));
  assert.ok(
    existsSync(
      join(
        'drizzle/meta',
        String(entry.idx).padStart(4, '0') + '_snapshot.json',
      ),
    ),
  );
  return { ...entry, file, sha256: hash(readFileSync(join('drizzle', file))) };
});
const main = manifest.files.find((file) => file.name.endsWith('.sqlite'));
assert.ok(main && basename(main.name) === main.name);
for (const file of manifest.files) {
  assert.equal(basename(file.name), file.name);
  assert.equal(hash(readFileSync(join(root, 'raw', file.name))), file.sha256);
}
const sourcePath = realpathSync(manifest.source);
for (const candidate of [
  join(root, 'raw', main.name),
  join(root, 'backup.sqlite'),
  join(root, 'restore-test.sqlite'),
])
  assert.notEqual(
    existsSync(candidate) ? realpathSync(candidate) : resolve(candidate),
    sourcePath,
    'Never open operational source',
  );
const stateFile = join(
  root,
  'simulation-state/v3/d1/miniflare-D1DatabaseObject',
  main.name,
);
if (mode === 'prepare') {
  const raw = new DatabaseSync(join(root, 'raw', main.name), {
    readOnly: true,
  });
  let before;
  try {
    before = inspect(raw);
    if (!existsSync(join(root, 'backup.sqlite')))
      await backup(raw, join(root, 'backup.sqlite'));
  } finally {
    raw.close();
  }
  const canonical = new DatabaseSync(join(root, 'backup.sqlite'), {
    readOnly: true,
  });
  try {
    assert.deepEqual(inspect(canonical).tables, before.tables);
  } finally {
    canonical.close();
  }
  if (!existsSync(join(root, 'restore-test.sqlite')))
    copyFileSync(
      join(root, 'backup.sqlite'),
      join(root, 'restore-test.sqlite'),
      constants.COPYFILE_EXCL,
    );
  const restored = new DatabaseSync(join(root, 'restore-test.sqlite'), {
    readOnly: true,
  });
  try {
    const inspection = inspect(restored);
    assert.deepEqual(inspection.tables, before.tables);
    assert.deepEqual(inspection.history, before.history);
    assert.deepEqual(inspection.objects, before.objects);
  } finally {
    restored.close();
  }
  const names = before.history.map((entry) => entry.name);
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual(
    names,
    migrations.slice(0, names.length).map((migration) => migration.file),
    'Migration history is not an exact journal prefix',
  );
  assert.ok(
    names.length >= 7 && names.length <= 12,
    'Baseline outside approved 0007-0011 scope',
  );
  const pending = migrations.slice(names.length);
  const expected = new DatabaseSync(':memory:');
  const baselineDifferences = [];
  try {
    expected.exec('PRAGMA foreign_keys=ON');
    for (const migration of migrations.slice(0, names.length))
      expected.exec(
        readFileSync(join('drizzle', migration.file), 'utf8').replaceAll(
          '--> statement-breakpoint',
          '',
        ),
      );
    for (const table of tables(expected)) {
      assert.ok(before.tables[table], `Applied schema missing table ${table}`);
      const columns = expected
          .prepare(`PRAGMA table_info(${quote(table)})`)
          .all(),
        foreignKeys = expected
          .prepare(`PRAGMA foreign_key_list(${quote(table)})`)
          .all();
      if (json(before.tables[table].columns) !== json(columns))
        baselineDifferences.push({
          table,
          kind: 'columns',
          actual: before.tables[table].columns,
          expected: columns,
        });
      if (json(before.tables[table].foreignKeys) !== json(foreignKeys))
        baselineDifferences.push({
          table,
          kind: 'foreignKeys',
          actual: before.tables[table].foreignKeys,
          expected: foreignKeys,
        });
    }
    const known = expected
      .prepare(
        "SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
      )
      .all();
    for (const object of known) {
      const actual = before.objects.find(
        (row) => row.name === object.name && row.type === object.type,
      );
      assert.ok(actual, `Missing object ${object.name}`);
      if (
        actual.sql?.replace(/\s+/g, ' ').trim() !==
        object.sql?.replace(/\s+/g, ' ').trim()
      )
        baselineDifferences.push({
          name: object.name,
          kind: 'ddl',
          actual: actual.sql,
          expected: object.sql,
        });
    }
  } finally {
    expected.close();
  }
  mkdirSync(dirname(stateFile), { recursive: true });
  copyFileSync(join(root, 'backup.sqlite'), stateFile, constants.COPYFILE_EXCL);
  write('baseline-inspection.json', before);
  write('baseline-differences.json', baselineDifferences);
  write(
    'migration-plan.json',
    migrations.map((migration) => ({
      ...migration,
      state: names.includes(migration.file) ? 'applied' : 'pending',
    })),
  );
  write('backup-verification.json', {
    restoration: 'passed',
    backupSha256: hash(readFileSync(join(root, 'backup.sqlite'))),
    rawSha256: main.sha256,
    counts: Object.fromEntries(
      Object.entries(before.tables).map(([name, table]) => [name, table.count]),
    ),
    pending: pending.map((migration) => migration.file),
  });
  console.log(
    JSON.stringify(
      {
        restoration: 'passed',
        history: before.history,
        pending: pending.map((migration) => migration.file),
        counts: Object.fromEntries(
          Object.entries(before.tables).map(([name, table]) => [
            name,
            table.count,
          ]),
        ),
      },
      null,
      2,
    ),
  );
} else {
  const before = JSON.parse(
    readFileSync(join(root, 'baseline-inspection.json'), 'utf8'),
  );
  const db = new DatabaseSync(stateFile, { readOnly: true });
  try {
    const after = inspect(db);
    assert.deepEqual(
      after.history.map((entry) => entry.name),
      migrations.map((migration) => migration.file),
    );
    assert.deepEqual(
      JSON.parse(json(after.history.slice(0, before.history.length))),
      before.history,
    );
    const preservation = {};
    for (const [table, prior] of Object.entries(before.tables)) {
      if (table === 'd1_migrations') continue;
      const columns = prior.columns.map((column) => column.name);
      assert.equal(
        after.tables[table].count,
        prior.count,
        `Count changed: ${table}`,
      );
      if (table === '_cf_METADATA') {
        preservation[table] = {
          count: prior.count,
          platformMetadataChanged:
            rowsDigest(db, table, columns) !== prior.digest,
          reason: 'D1 internal write/bookmark metadata; not application rows',
        };
        continue;
      }
      assert.equal(
        rowsDigest(db, table, columns),
        prior.digest,
        `Existing rows changed: ${table}`,
      );
      preservation[table] = {
        count: prior.count,
        allOriginalColumnsIdentical: true,
      };
    }
    assert.equal(
      db
        .prepare(
          'SELECT count(*) AS n FROM tickets WHERE creation_fingerprint IS NOT NULL',
        )
        .get().n,
      0,
    );
    const expected = new DatabaseSync(':memory:');
    try {
      expected.exec('PRAGMA foreign_keys=ON');
      for (const migration of migrations)
        expected.exec(
          readFileSync(join('drizzle', migration.file), 'utf8').replaceAll(
            '--> statement-breakpoint',
            '',
          ),
        );
      for (const object of expected
        .prepare(
          "SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
        )
        .all()) {
        const actual = after.objects.find(
          (row) => row.name === object.name && row.type === object.type,
        );
        assert.ok(actual, `Missing ${object.name}`);
        if (
          !before.objects.some(
            (prior) => prior.name === object.name && prior.type === object.type,
          )
        )
          assert.equal(
            actual.sql?.replace(/\s+/g, ' ').trim(),
            object.sql?.replace(/\s+/g, ' ').trim(),
            `New DDL differs: ${object.name}`,
          );
        else {
          const prior = before.objects.find(
            (prior) => prior.name === object.name && prior.type === object.type,
          );
          if (object.name !== 'tickets')
            assert.equal(
              actual.sql,
              prior.sql,
              `Existing DDL changed: ${object.name}`,
            );
        }
      }
    } finally {
      expected.close();
    }
    write('after-inspection.json', after);
    write('simulation-verification.json', {
      integrity: 'ok',
      foreignKeyViolations: 0,
      preservation,
      migrations: after.history,
      expectedNewSchema: 'matched',
      baselineDifferences:
        'See baseline-differences.json; existing drift was preserved, not repaired',
    });
    console.log(
      JSON.stringify(
        {
          simulation: 'passed',
          preservation,
          tables: Object.keys(after.tables),
        },
        null,
        2,
      ),
    );
  } finally {
    db.close();
  }
}
