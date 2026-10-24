import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';

export class D1Memory {
  readonly sqlite = new DatabaseSync(':memory:');
  beforeRun: ((sql: string) => void) | null = null;
  includeTriggerChanges = false;
  constructor() {
    this.sqlite.exec('PRAGMA foreign_keys=ON');
    for (const file of readdirSync('drizzle')
      .filter((file) => /^\d{4}_.+\.sql$/.test(file))
      .sort())
      this.sqlite.exec(
        readFileSync(`drizzle/${file}`, 'utf8').replaceAll(
          '--> statement-breakpoint',
          '',
        ),
      );
  }
  prepare(sql: string) {
    let values: SQLInputValue[] = [];
    const execute = () => {
      this.beforeRun?.(sql);
      const statement = this.sqlite.prepare(sql);
      if (statement.columns().length)
        return {
          success: true,
          results: statement.all(...values),
          meta: { changes: 0, last_row_id: 0 },
        };
      const before = this.includeTriggerChanges
        ? Number(this.sqlite.prepare('SELECT total_changes() AS n').get()!.n)
        : 0;
      const result = statement.run(...values);
      return {
        success: true,
        results: [],
        meta: {
          changes: this.includeTriggerChanges
            ? Number(this.sqlite.prepare('SELECT total_changes() AS n').get()!.n) - before
            : Number(result.changes),
          last_row_id: Number(result.lastInsertRowid),
        },
      };
    };
    const prepared = {
      bind(...input: SQLInputValue[]) {
        values = input;
        return prepared;
      },
      first: async <T>() =>
        (this.sqlite.prepare(sql).get(...values) as T | undefined) ?? null,
      all: async <T>() => ({
        success: true,
        results: this.sqlite.prepare(sql).all(...values) as T[],
      }),
      run: async () => execute(),
      execute,
    };
    return prepared;
  }
  async batch(statements: Array<ReturnType<D1Memory['prepare']>>) {
    this.sqlite.exec('BEGIN');
    try {
      const result = statements.map((statement) => statement.execute());
      this.sqlite.exec('COMMIT');
      return result;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
  asD1() {
    return this as unknown as D1Database;
  }
}
