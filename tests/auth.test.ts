import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import test from 'node:test';
import { D1AuthRepository } from '../db/auth-storage.ts';
import { AuthError } from '../services/auth/auth-errors.ts';
import { createAuthHandlers, logLocalAuthFailure } from '../services/auth/auth-handlers.ts';
import { requireAuthenticatedUser, requireRole, withRequiredRole } from '../services/auth/api-access.ts';
import { AuthService, hashSessionToken } from '../services/auth/auth-service.ts';
import { LoginRateLimiter } from '../services/auth/login-rate-limit.ts';
import type { AuthUser, GlpiIdentity, GlpiIdentityProvider } from '../services/auth/auth-types.ts';
import { GlpiUserAuthClient, GlpiUserAuthError, readGlpiUserAuthConfig } from '../services/glpi/glpi-user-auth.ts';

interface D1ResultLike {
  success: true;
  meta: { changes: number; last_row_id: number };
  results?: unknown[];
}

class AuthD1Harness {
  readonly sqlite = new DatabaseSync(':memory:');

  constructor() {
    this.sqlite.exec('PRAGMA foreign_keys = ON');
    const migrations = readdirSync('drizzle').filter((file) => /^\d{4}_.+\.sql$/.test(file)).sort();
    for (const file of migrations) {
      this.sqlite.exec(readFileSync(`drizzle/${file}`, 'utf8').replaceAll('--> statement-breakpoint', ''));
    }
  }

  prepare(sql: string) {
    let values: unknown[] = [];
    const statement = {
      bind: (...input: unknown[]) => { values = input; return statement; },
      run: async (): Promise<D1ResultLike> => {
        const result = this.sqlite.prepare(sql).run(...(values as SQLInputValue[]));
        return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
      },
      first: async <T>() => this.sqlite.prepare(sql).get(...(values as SQLInputValue[])) as T | undefined ?? null,
      all: async <T>() => ({
        success: true as const,
        results: this.sqlite.prepare(sql).all(...(values as SQLInputValue[])) as T[],
      }),
    };
    return statement;
  }

  async batch(statements: Array<{ run: () => Promise<D1ResultLike> }>): Promise<D1ResultLike[]> {
    this.sqlite.exec('BEGIN');
    try {
      const results: D1ResultLike[] = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }

  asD1(): D1Database {
    return this as unknown as D1Database;
  }

  close() { this.sqlite.close(); }
}

const identity: GlpiIdentity = { glpiUserId: 8102, username: 'Operator.Test', name: 'Test Operator' };
const fixedNow = new Date('2026-10-07T12:00:00.000Z');
const fixedToken = 'a'.repeat(43);

class MockIdentityProvider implements GlpiIdentityProvider {
  calls = 0;
  private readonly result: GlpiIdentity | Error;
  constructor(result: GlpiIdentity | Error = identity) { this.result = result; }
  async authenticate(): Promise<GlpiIdentity> {
    this.calls += 1;
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

function service(harness: AuthD1Harness, provider = new MockIdentityProvider(), bootstrapId?: number) {
  return new AuthService({
    repository: new D1AuthRepository(harness.asD1()),
    glpi: provider,
    bootstrapGlpiUserId: bootstrapId,
    now: () => new Date(fixedNow),
    tokenFactory: () => fixedToken,
  });
}

function insertUser(harness: AuthD1Harness, input: { glpiUserId?: number; username?: string; name?: string; role?: string; active?: boolean } = {}) {
  const defaults = { glpiUserId: identity.glpiUserId, username: 'operator.test', name: 'Local Name', role: 'operator', active: true };
  const values = { ...defaults, ...input };
  harness.sqlite.prepare(`INSERT INTO users
    (glpi_user_id, username, name, role, active, revision, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)`)
    .run(values.glpiUserId, values.username, values.name, values.role, values.active ? 1 : 0, fixedNow.toISOString(), fixedNow.toISOString());
}

function handlers(harness: AuthD1Harness, provider = new MockIdentityProvider(), bootstrapId?: number, limiter = new LoginRateLimiter()) {
  return createAuthHandlers({ service: service(harness, provider, bootstrapId), limiter });
}

function loginRequest(body: unknown, options: { contentType?: string; ip?: string; url?: string } = {}) {
  return new Request(options.url ?? 'http://localhost/api/auth/login', {
    method: 'POST',
    headers: {
      'content-type': options.contentType ?? 'application/json',
      'cf-connecting-ip': options.ip ?? '192.0.2.50',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function readSessionRow(harness: AuthD1Harness) {
  return harness.sqlite.prepare('SELECT token_hash, created_at, last_seen_at, expires_at, revoked_at FROM sessions').get();
}

void test('login payload rejects unknown fields, empty/wrong types, invalid content type, and oversized body before GLPI', async () => {
  const harness = new AuthD1Harness();
  try {
    const provider = new MockIdentityProvider();
    const api = handlers(harness, provider, undefined, new LoginRateLimiter({ maxAttempts: 20 }));
    for (const request of [
      loginRequest({ username: 'user', password: 'pass', extra: true }),
      loginRequest({ username: '', password: 'pass' }),
      loginRequest({ username: 'user', password: '' }),
      loginRequest({ username: 'user', password: 42 }),
      loginRequest({ username: 'u:ser', password: 'pass' }),
      loginRequest({ username: 'user', password: 'p'.repeat(2100) }),
      loginRequest('{invalid json'),
      loginRequest('null'),
      loginRequest('[]'),
      loginRequest({ username: 'user', password: 'pass' }, { contentType: 'text/plain' }),
      loginRequest('x'.repeat(2100)),
    ]) {
      const response = await api.login(request);
      assert.equal(response.status, 400);
    }
    assert.equal(provider.calls, 0);
    assert.equal(harness.sqlite.prepare('SELECT COUNT(*) AS n FROM sessions').get()?.n, 0);
  } finally { harness.close(); }
});

void test('invalid GLPI credentials return a safe failure and do not create local data', async () => {
  const harness = new AuthD1Harness();
  try {
    const api = handlers(harness, new MockIdentityProvider(new GlpiUserAuthError('invalid-credentials')));
    const response = await api.login(loginRequest({ username: 'human', password: 'synthetic-only' }));
    assert.equal(response.status, 401);
    assert.match((await response.text()), /não foi possível autenticar ou autorizar/i);
    await assert.rejects(service(harness, new MockIdentityProvider(new GlpiUserAuthError('invalid-credentials')))
      .login('human', 'synthetic-only'), (error: unknown) => error instanceof AuthError && error.reason === 'GLPI_CREDENTIALS_INVALID');
    assert.equal(harness.sqlite.prepare('SELECT COUNT(*) AS n FROM users').get()?.n, 0);
    assert.equal(harness.sqlite.prepare('SELECT COUNT(*) AS n FROM sessions').get()?.n, 0);
  } finally { harness.close(); }
});

void test('GLPI unavailability is normalized to temporary failure', async () => {
  const harness = new AuthD1Harness();
  try {
    const api = handlers(harness, new MockIdentityProvider(new GlpiUserAuthError('unavailable')));
    const response = await api.login(loginRequest({ username: 'human', password: 'synthetic-only' }));
    assert.equal(response.status, 503);
    assert.equal((await response.json() as { code: string }).code, 'AUTH_PROVIDER_UNAVAILABLE');
  } finally { harness.close(); }
});

void test('authenticated GLPI identity without local user and with closed bootstrap gets no session', async () => {
  const harness = new AuthD1Harness();
  try {
    const api = handlers(harness);
    const response = await api.login(loginRequest({ username: 'operator.test', password: 'synthetic-only' }));
    assert.equal(response.status, 401);
    assert.equal(response.headers.has('set-cookie'), false);
    assert.equal(harness.sqlite.prepare('SELECT COUNT(*) AS n FROM users').get()?.n, 0);
    assert.equal(harness.sqlite.prepare('SELECT COUNT(*) AS n FROM sessions').get()?.n, 0);
  } finally { harness.close(); }
});

void test('inactive local user is denied without a session', async () => {
  const harness = new AuthD1Harness();
  try {
    insertUser(harness, { active: false });
    const response = await handlers(harness).login(loginRequest({ username: 'operator.test', password: 'synthetic-only' }));
    assert.equal(response.status, 401);
    assert.equal(response.headers.has('set-cookie'), false);
    assert.equal(harness.sqlite.prepare('SELECT COUNT(*) AS n FROM sessions').get()?.n, 0);
  } finally { harness.close(); }
});

void test('active local user receives session without role or profile synchronization', async () => {
  const harness = new AuthD1Harness();
  try {
    insertUser(harness, { role: 'operator', name: 'Pinned local display name', username: 'operator.test' });
    const response = await handlers(harness).login(loginRequest({ username: 'operator.test', password: 'synthetic-only' }));
    assert.equal(response.status, 200);
    const body = await response.json() as { user: AuthUser };
    assert.equal(body.user.role, 'operator');
    assert.equal(body.user.name, 'Pinned local display name');
    assert.equal(body.user.username, 'operator.test');
    assert.equal(body.user.glpiUserId, identity.glpiUserId);
    const cookie = response.headers.get('set-cookie') ?? '';
    assert.match(cookie, /^opuslog_session=[A-Za-z0-9_-]{40,50}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=28800$/);
    assert.doesNotMatch(cookie, /Secure/); // HTTP local runtime
    assert.equal(harness.sqlite.prepare('SELECT COUNT(*) AS n FROM sessions').get()?.n, 1);
  } finally { harness.close(); }
});

void test('session stores SHA-256 only, has an eight-hour absolute expiry, and me exposes no session data', async () => {
  const harness = new AuthD1Harness();
  try {
    insertUser(harness);
    const api = handlers(harness);
    const login = await api.login(loginRequest({ username: 'operator.test', password: 'synthetic-only' }));
    const cookie = login.headers.get('set-cookie') ?? '';
    const sessionRow = readSessionRow(harness) as { token_hash: string; created_at: string; last_seen_at: string; expires_at: string };
    assert.notEqual(sessionRow.token_hash, fixedToken);
    assert.equal(sessionRow.token_hash, await hashSessionToken(fixedToken));
    assert.equal(sessionRow.created_at, fixedNow.toISOString());
    assert.equal(sessionRow.last_seen_at, fixedNow.toISOString());
    assert.equal(sessionRow.expires_at, '2026-10-07T20:00:00.000Z');
    const me = await api.me(new Request('http://localhost/api/auth/me', { headers: { cookie: cookie.split(';')[0] } }));
    const meBody = await me.text();
    assert.deepEqual(JSON.parse(meBody), { user: {
      id: 1, glpiUserId: identity.glpiUserId, username: 'operator.test', name: 'Local Name', role: 'operator', active: true,
    } });
    assert.equal((readSessionRow(harness) as { last_seen_at: string }).last_seen_at, fixedNow.toISOString());
    assert.doesNotMatch(meBody, /token_hash|session_token|password/i);
  } finally { harness.close(); }
});

void test('me rejects absent, expired, and revoked session cookies', async () => {
  const harness = new AuthD1Harness();
  try {
    insertUser(harness);
    const repo = new D1AuthRepository(harness.asD1());
    await repo.createSession({ userId: 1, tokenHash: await hashSessionToken(fixedToken), createdAt: '2026-10-06T00:00:00.000Z', expiresAt: '2026-10-07T11:59:59.000Z' });
    const api = createAuthHandlers({ service: service(harness), limiter: new LoginRateLimiter() });
    const expired = await api.me(new Request('http://localhost/api/auth/me', { headers: { cookie: `opuslog_session=${fixedToken}` } }));
    assert.deepEqual(await expired.json(), { user: null });
    await repo.createSession({ userId: 1, tokenHash: await hashSessionToken('b'.repeat(43)), createdAt: fixedNow.toISOString(), expiresAt: '2026-10-08T00:00:00.000Z' });
    await repo.revokeSession({ tokenHash: await hashSessionToken('b'.repeat(43)), revokedAt: fixedNow.toISOString() });
    const revoked = await api.me(new Request('http://localhost/api/auth/me', { headers: { cookie: `opuslog_session=${'b'.repeat(43)}` } }));
    assert.deepEqual(await revoked.json(), { user: null });
    const absent = await api.me(new Request('http://localhost/api/auth/me'));
    assert.deepEqual(await absent.json(), { user: null });
  } finally { harness.close(); }
});

void test('logout revokes current local session, clears cookie, and is idempotent', async () => {
  const harness = new AuthD1Harness();
  try {
    insertUser(harness);
    const api = handlers(harness);
    const login = await api.login(loginRequest({ username: 'operator.test', password: 'synthetic-only' }));
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const logoutRequest = new Request('http://localhost/api/auth/logout', { method: 'POST', headers: { cookie } });
    const logout = await api.logout(logoutRequest);
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get('set-cookie') ?? '', /Max-Age=0/);
    assert.ok((readSessionRow(harness) as { revoked_at: string }).revoked_at);
    assert.equal((await api.logout(logoutRequest)).status, 200);
    assert.deepEqual(await (await api.me(new Request('http://localhost/api/auth/me', { headers: { cookie } }))).json(), { user: null });
  } finally { harness.close(); }
});

void test('login cookie gets Secure for HTTPS and logout rejects mismatched Origin', async () => {
  const harness = new AuthD1Harness();
  try {
    insertUser(harness);
    const api = handlers(harness);
    const login = await api.login(loginRequest({ username: 'operator.test', password: 'synthetic-only' }, { url: 'https://opuslog.example/api/auth/login' }));
    assert.match(login.headers.get('set-cookie') ?? '', /; Secure$/);
    const logout = await api.logout(new Request('https://opuslog.example/api/auth/logout', {
      method: 'POST', headers: { origin: 'https://attacker.example', cookie: `opuslog_session=${fixedToken}` },
    }));
    assert.equal(logout.status, 403);
  } finally { harness.close(); }
});

void test('rate limit allows five attempts per IP in a finite window and returns Retry-After', async () => {
  const limiter = new LoginRateLimiter({ maxAttempts: 5, windowMs: 60_000 });
  for (let i = 0; i < 5; i += 1) assert.equal(limiter.consume('ip-a', 1000).allowed, true);
  const blocked = limiter.consume('ip-a', 2000);
  assert.deepEqual(blocked, { allowed: false, retryAfterSeconds: 59 });
  assert.equal(limiter.consume('ip-b', 2000).allowed, true);
  assert.equal(limiter.consume('ip-a', 61_000).allowed, true);
});

void test('login handler applies per-IP rate limiting and clears bucket after success', async () => {
  const harness = new AuthD1Harness();
  try {
    insertUser(harness);
    const limiter = new LoginRateLimiter({ maxAttempts: 1, windowMs: 60_000 });
    const api = handlers(harness, new MockIdentityProvider(new GlpiUserAuthError('invalid-credentials')), undefined, limiter);
    await api.login(loginRequest({ username: 'wrong', password: 'synthetic-only' }, { ip: '192.0.2.1' }));
    const limited = await api.login(loginRequest({ username: 'wrong', password: 'synthetic-only' }, { ip: '192.0.2.1' }));
    assert.equal(limited.status, 429);
    assert.ok(limited.headers.get('retry-after'));
    const otherIp = await api.login(loginRequest({ username: 'wrong', password: 'synthetic-only' }, { ip: '192.0.2.2' }));
    assert.equal(otherIp.status, 401);
  } finally { harness.close(); }
});

void test('authorized bootstrap creates only configured GLPI identity as local admin and closes singleton', async () => {
  const harness = new AuthD1Harness();
  try {
    const response = await handlers(harness, new MockIdentityProvider(), identity.glpiUserId)
      .login(loginRequest({ username: identity.username, password: 'synthetic-only' }));
    assert.equal(response.status, 200);
    const user = harness.sqlite.prepare('SELECT id, glpi_user_id, username, name, role, active FROM users').get();
    assert.deepEqual({ ...user }, { id: 1, glpi_user_id: identity.glpiUserId, username: 'operator.test', name: identity.name, role: 'admin', active: 1 });
    assert.ok(harness.sqlite.prepare('SELECT completed_at FROM auth_bootstrap WHERE id=1').get()?.completed_at);
    assert.equal(harness.sqlite.prepare('SELECT COUNT(*) AS n FROM users').get()?.n, 1);
  } finally { harness.close(); }
});

void test('bootstrap remains closed without allowlist, on ID mismatch, and after it has completed', async () => {
  const harness = new AuthD1Harness();
  try {
    const noAllowlist = await handlers(harness).login(loginRequest({ username: 'human', password: 'synthetic-only' }));
    assert.equal(noAllowlist.status, 401);
    const noAllowlistBody = await noAllowlist.json() as Record<string, unknown>;
    assert.equal(noAllowlistBody.code, 'AUTH_LOGIN_FAILED');
    assert.equal('reason' in noAllowlistBody, false);
    await assert.rejects(service(harness).login('human', 'synthetic-only'), (error: unknown) =>
      error instanceof AuthError && error.reason === 'GLPI_USER_NOT_AUTHORIZED' &&
      error.diagnostic.stage === 'bootstrap' && error.diagnostic.reason === 'GLPI_USER_NOT_AUTHORIZED');
    const mismatch = await handlers(harness, new MockIdentityProvider(), identity.glpiUserId + 1)
      .login(loginRequest({ username: 'human', password: 'synthetic-only' }));
    assert.equal(mismatch.status, 401);
    const allowed = new D1AuthRepository(harness.asD1());
    assert.ok(await allowed.bootstrapFirstAdmin({ ...identity, username: 'operator.test' }, identity.glpiUserId));
    const second = await allowed.bootstrapFirstAdmin({ ...identity, glpiUserId: identity.glpiUserId + 1, username: 'other' }, identity.glpiUserId + 1);
    assert.equal(second, null);
    assert.equal(harness.sqlite.prepare('SELECT COUNT(*) AS n FROM users').get()?.n, 1);
  } finally { harness.close(); }
});

void test('local auth diagnostic logs only safe stage/reason and never logs for a remote request', () => {
  const messages: string[] = [];
  const localRequest = new Request('http://127.0.0.1/api/auth/login');
  const remoteRequest = new Request('https://opuslog.example/api/auth/login');
  const failure = new AuthError('AUTH_LOGIN_FAILED', 'GLPI_USER_NOT_AUTHORIZED');

  logLocalAuthFailure(localRequest, failure, (message) => messages.push(message));
  logLocalAuthFailure(remoteRequest, failure, (message) => messages.push(message));

  assert.deepEqual(messages, ['AUTH_LOGIN_FAILURE stage=bootstrap reason=GLPI_USER_NOT_AUTHORIZED']);
});

void test('protected GET and POST reject missing, revoked, expired, and inactive sessions with 401', async () => {
  const expiredRevokedOrInactive = async () => null;
  let reachedHandler = false;
  for (const method of ['GET', 'POST']) {
    const request = new Request('http://localhost/api/protected', { method });
    const response = await withRequiredRole(request, 'viewer', expiredRevokedOrInactive, () => {
      reachedHandler = true;
      return Response.json({ ok: true });
    });
    assert.equal(response.status, 401);
  }
  assert.equal(reachedHandler, false);

  const databaseFailure = await requireAuthenticatedUser(
    new Request('http://localhost/api/protected', { headers: { cookie: `opuslog_session=${fixedToken}` } }),
    async () => { throw new AuthError('AUTH_STORAGE_UNAVAILABLE'); },
  );
  assert.ok('response' in databaseFailure);
  if ('response' in databaseFailure) assert.equal(databaseFailure.response.status, 503);
});

void test('protected access rejects actually expired, revoked, and inactive database sessions', async () => {
  const cases = [
    { active: true, expiresAt: '2026-10-07T11:59:59.000Z', revokedAt: null },
    { active: true, expiresAt: '2026-10-07T13:00:00.000Z', revokedAt: '2026-10-07T12:01:00.000Z' },
    { active: false, expiresAt: '2026-10-07T13:00:00.000Z', revokedAt: null },
  ];
  for (const state of cases) {
    const harness = new AuthD1Harness();
    try {
      insertUser(harness, { active: state.active });
      const tokenHash = await hashSessionToken(fixedToken);
      harness.sqlite.prepare(`INSERT INTO sessions (user_id, token_hash, created_at, last_seen_at, expires_at, revoked_at)
        VALUES (1, ?, ?, ?, ?, ?)`)
        .run(tokenHash, fixedNow.toISOString(), fixedNow.toISOString(), state.expiresAt, state.revokedAt);
      const request = new Request('http://localhost/api/protected', {
        headers: { cookie: `opuslog_session=${fixedToken}` },
      });
      const result = await requireAuthenticatedUser(request, (token) => service(harness).currentUser(token));
      assert.ok('response' in result);
      if ('response' in result) assert.equal(result.response.status, 401);
    } finally { harness.close(); }
  }
});

void test('viewer can read but cannot write or open tickets; operator and admin role hierarchy is enforced', async () => {
  const makeUser = (role: AuthUser['role']): AuthUser => ({
    id: 9, glpiUserId: identity.glpiUserId, username: 'viewer.test', name: 'Test User', role, active: true,
  });
  const viewer = makeUser('viewer');
  const operator = makeUser('operator');
  const admin = makeUser('admin');

  assert.equal(requireRole(viewer, 'viewer'), null);
  assert.equal(requireRole(viewer, 'operator')?.status, 403);
  assert.equal(requireRole(viewer, 'admin')?.status, 403);
  assert.equal(requireRole(operator, 'operator'), null);
  assert.equal(requireRole(operator, 'admin')?.status, 403);
  assert.equal(requireRole(admin, 'admin'), null);
  assert.equal(requireRole({ ...viewer, active: false }, 'viewer')?.status, 401);

  const request = (path: string) => new Request(`http://localhost${path}`, { headers: { cookie: `opuslog_session=${fixedToken}` } });
  const run = (path: string, minimum: AuthUser['role'], actor: AuthUser) => withRequiredRole(
    request(path), minimum, async () => actor, () => Response.json({ success: true }),
  );
  assert.equal((await run('/api/data', 'viewer', viewer)).status, 200);
  assert.equal((await run('/api/data', 'operator', viewer)).status, 403);
  assert.equal((await run('/api/glpi/tickets', 'operator', viewer)).status, 403);
  assert.equal((await run('/api/data', 'operator', operator)).status, 200);
  assert.equal((await run('/api/glpi/tickets', 'operator', operator)).status, 200);
  assert.equal((await run('/api/glpi/test', 'admin', operator)).status, 403);
  assert.equal((await run('/api/glpi/test', 'admin', admin)).status, 200);
});

void test('valid cookie is resolved server-side and handler receives the database user', async () => {
  let receivedToken: string | null = null;
  const request = new Request('http://localhost/api/protected', {
    headers: { cookie: `opuslog_session=${fixedToken}` },
  });
  const response = await withRequiredRole(request, 'operator', async (token) => {
    receivedToken = token;
    return { id: 9, glpiUserId: identity.glpiUserId, username: 'ops', name: 'Operator', role: 'operator', active: true };
  }, (user) => Response.json({ role: user.role }));
  assert.equal(response.status, 200);
  assert.equal(receivedToken, fixedToken);
  assert.deepEqual(await response.json(), { role: 'operator' });
});

void test('failed bootstrap insertion rolls back both the user row and singleton completion', async () => {
  const harness = new AuthD1Harness();
  try {
    const repository = new D1AuthRepository(harness.asD1());
    await assert.rejects(repository.bootstrapFirstAdmin(
      { ...identity, username: ' Invalid Username ' },
      identity.glpiUserId,
    ));
    assert.equal(harness.sqlite.prepare('SELECT COUNT(*) AS n FROM users').get()?.n, 0);
    assert.equal(harness.sqlite.prepare('SELECT completed_at FROM auth_bootstrap WHERE id=1').get()?.completed_at, null);
  } finally { harness.close(); }
});

void test('GLPI Basic auth client sends human credentials only to initSession and always kills a successful session', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const responses = [
    Response.json({ session_token: 'synthetic-session-token' }),
    Response.json({ session: { glpiID: 8102, glpiname: 'Operator.Test', glpifirstname: 'Test', glpirealname: 'Operator' } }),
    Response.json({ success: true }),
  ];
  const client = new GlpiUserAuthClient(readGlpiUserAuthConfig({
    GLPI_API_VERSION: 'v1', GLPI_BASE_URL: 'http://glpi.example.invalid/glpi/apirest.php', GLPI_APP_TOKEN: 'synthetic-app', GLPI_TIMEOUT_MS: '10000',
  }), async (input, init) => {
    const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
    calls.push({ url, init: init ?? {} });
    return responses.shift()!;
  });
  const result = await client.authenticate('Operator.Test', 'not-a-real-password');
  assert.deepEqual(result, identity);
  assert.equal(calls.length, 3);
  assert.match(calls[0].url, /\/initSession$/);
  const initHeaders = new Headers(calls[0].init.headers);
  assert.match(initHeaders.get('authorization') ?? '', /^Basic /);
  assert.equal(initHeaders.get('app-token'), 'synthetic-app');
  for (const call of calls.slice(1)) {
    const headers = new Headers(call.init.headers);
    assert.equal(headers.has('authorization'), false);
    assert.equal(headers.get('session-token'), 'synthetic-session-token');
  }
  assert.match(calls[2].url, /\/killSession$/);
  assert.deepEqual(calls.map((call) => new URL(call.url).pathname.split('/').pop()), ['initSession', 'getFullSession', 'killSession']);
});

void test('GLPI auth kills the session after identity failure and does not retry invalid credentials', async () => {
  let calls = 0;
  const invalid = new GlpiUserAuthClient(readGlpiUserAuthConfig({
    GLPI_API_VERSION: 'v1', GLPI_BASE_URL: 'http://glpi.example.invalid/glpi/apirest.php', GLPI_TIMEOUT_MS: '10000',
  }), async () => { calls += 1; return Response.json({ ERROR: 'safe synthetic denial' }, { status: 401 }); });
  await assert.rejects(invalid.authenticate('human', 'synthetic-only'), { failure: 'invalid-credentials' });
  assert.equal(calls, 1);

  const responses = [Response.json({ session_token: 'synthetic-token' }), Response.json({ session: {} }), Response.json({ success: true })];
  const cleanupCalls: string[] = [];
  const malformedIdentity = new GlpiUserAuthClient(readGlpiUserAuthConfig({
    GLPI_API_VERSION: 'v1', GLPI_BASE_URL: 'http://glpi.example.invalid/glpi/apirest.php', GLPI_TIMEOUT_MS: '10000',
  }), async (input) => {
    cleanupCalls.push(input instanceof Request ? input.url : input instanceof URL ? input.href : input);
    return responses.shift()!;
  });
  await assert.rejects(malformedIdentity.authenticate('human', 'synthetic-only'), { failure: 'identity' });
  assert.equal(cleanupCalls.length, 3);
  assert.match(cleanupCalls[2], /killSession$/);
});

void test('GLPI user auth config does not require or inspect the technical user token', () => {
  const config = readGlpiUserAuthConfig({
    GLPI_API_VERSION: 'v1', GLPI_BASE_URL: 'https://glpi.example.invalid/glpi/apirest.php', GLPI_TIMEOUT_MS: '10000',
  });
  assert.equal(config.appToken, '');
  assert.throws(() => readGlpiUserAuthConfig({ GLPI_API_VERSION: 'v2', GLPI_BASE_URL: 'https://glpi.example.invalid/apirest.php' }), { failure: 'configuration' });
});

void test('mismatched login Origin is rejected before authentication', async () => {
  const harness = new AuthD1Harness();
  try {
    const provider = new MockIdentityProvider();
    const request = new Request('http://localhost/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify({ username: 'human', password: 'synthetic-only' }),
    });
    const response = await handlers(harness, provider).login(request);
    assert.equal(response.status, 401);
    assert.equal(provider.calls, 0);
  } finally { harness.close(); }
});

void test('no handler response or persisted database value contains raw session token or password fields', async () => {
  const harness = new AuthD1Harness();
  try {
    insertUser(harness);
    const api = handlers(harness);
    const response = await api.login(loginRequest({ username: 'operator.test', password: 'unique-synthetic-password-value' }));
    const responseBody = await response.text();
    assert.doesNotMatch(responseBody, /unique-synthetic-password-value|${fixedToken}/);
    const dump = JSON.stringify(harness.sqlite.prepare('SELECT * FROM users').all()) + JSON.stringify(harness.sqlite.prepare('SELECT * FROM sessions').all());
    assert.doesNotMatch(dump, /unique-synthetic-password-value/);
    assert.doesNotMatch(dump, new RegExp(fixedToken));
    assert.equal(harness.sqlite.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('users') WHERE name LIKE '%password%'").get()?.n, 0);
  } finally { harness.close(); }
});
