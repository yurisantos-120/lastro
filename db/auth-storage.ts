import type { AuthRepository, AuthUser, GlpiIdentity, LocalAuthRole } from '../services/auth/auth-types.ts';

interface UserRow extends Record<string, unknown> {
  id: number;
  glpiUserId: number;
  username: string;
  name: string;
  role: LocalAuthRole;
  active: number;
}

const userColumns = `users.id AS id, users.glpi_user_id AS glpiUserId,
  users.username AS username, users.name AS name, users.role AS role, users.active AS active`;

function toAuthUser(row: UserRow | null): AuthUser | null {
  if (!row) return null;
  return {
    id: Number(row.id),
    glpiUserId: Number(row.glpiUserId),
    username: String(row.username),
    name: String(row.name),
    role: row.role,
    active: Number(row.active) === 1,
  };
}

export class AuthStorageError extends Error {
  constructor() {
    super('Authentication storage unavailable');
    this.name = 'AuthStorageError';
  }
}

export class D1AuthRepository implements AuthRepository {
  private readonly db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async checkSessionStorage(): Promise<void> {
    try {
      // A missing/failed session store must not look like an anonymous session.
      await this.db.prepare('SELECT 1 FROM sessions LIMIT 1').first();
    } catch {
      throw new AuthStorageError();
    }
  }

  async findByGlpiUserId(glpiUserId: number): Promise<AuthUser | null> {
    try {
      const row = await this.db.prepare(`SELECT ${userColumns} FROM users WHERE glpi_user_id = ?`)
        .bind(glpiUserId).first<UserRow>();
      return toAuthUser(row);
    } catch {
      throw new AuthStorageError();
    }
  }

  async bootstrapFirstAdmin(identity: GlpiIdentity, allowedGlpiUserId: number): Promise<AuthUser | null> {
    if (identity.glpiUserId !== allowedGlpiUserId) return null;
    const now = new Date().toISOString();
    try {
      const results = await this.db.batch([
        this.db.prepare(`UPDATE auth_bootstrap SET completed_at = ?
          WHERE id = 1 AND completed_at IS NULL AND NOT EXISTS (SELECT 1 FROM users)
            AND ? = ?`).bind(now, identity.glpiUserId, allowedGlpiUserId),
        this.db.prepare(`INSERT INTO users
          (glpi_user_id, username, name, role, active, revision, created_at, updated_at)
          SELECT ?, ?, ?, 'admin', 1, 1, ?, ?
          WHERE changes() = 1
            AND EXISTS (SELECT 1 FROM auth_bootstrap WHERE id = 1 AND completed_at = ?)
            AND NOT EXISTS (SELECT 1 FROM users)`)
          .bind(identity.glpiUserId, identity.username, identity.name, now, now, now),
      ]);
      if (results[1]?.meta.changes !== 1) return null;
      return await this.findByGlpiUserId(identity.glpiUserId);
    } catch {
      throw new AuthStorageError();
    }
  }

  async createSession(input: { userId: number; tokenHash: string; createdAt: string; expiresAt: string }): Promise<void> {
    try {
      const result = await this.db.prepare(`INSERT INTO sessions (user_id, token_hash, created_at, last_seen_at, expires_at)
        SELECT ?, ?, ?, ?, ? FROM users WHERE id = ? AND active = 1`)
        .bind(input.userId, input.tokenHash, input.createdAt, input.createdAt, input.expiresAt, input.userId).run();
      if (result.meta.changes !== 1) throw new AuthStorageError();
    } catch {
      throw new AuthStorageError();
    }
  }

  async getSessionUser(input: { tokenHash: string; now: string }): Promise<AuthUser | null> {
    try {
      const row = await this.db.prepare(`SELECT ${userColumns} FROM sessions
        INNER JOIN users ON users.id = sessions.user_id
        WHERE sessions.token_hash = ? AND sessions.revoked_at IS NULL
          AND sessions.expires_at > ? AND users.active = 1`)
        .bind(input.tokenHash, input.now).first<UserRow>();
      const user = toAuthUser(row);
      if (!user) return null;
      const result = await this.db.prepare(`UPDATE sessions SET last_seen_at = ?
        WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?`)
        .bind(input.now, input.tokenHash, input.now).run();
      return result.meta.changes === 1 ? user : null;
    } catch {
      throw new AuthStorageError();
    }
  }

  async revokeSession(input: { tokenHash: string; revokedAt: string }): Promise<void> {
    try {
      await this.db.prepare(`UPDATE sessions SET revoked_at = ?
        WHERE token_hash = ? AND revoked_at IS NULL`)
        .bind(input.revokedAt, input.tokenHash).run();
    } catch {
      throw new AuthStorageError();
    }
  }
}
