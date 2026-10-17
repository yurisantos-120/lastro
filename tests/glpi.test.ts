import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GlpiClient } from '../services/glpi/glpi-client.ts';
import { readGlpiConfig } from '../services/glpi/glpi-config.ts';
import {
  GlpiTicketService,
  validateTicket,
} from '../services/glpi/glpi-ticket-service.ts';
import { glpiFailure } from '../services/glpi/glpi-errors.ts';

// Synthetic credentials, no infrastructure or real GLPI is contacted.
const env = {
  GLPI_API_VERSION: 'v1',
  GLPI_BASE_URL: 'https://glpi.example.invalid/glpi/apirest.php/',
  GLPI_USER_TOKEN: 'test-user',
  GLPI_APP_TOKEN: 'test-app',
};
const config = readGlpiConfig(env);
const input = { title: 'Teste', content: 'Descrição de teste' };
function fixture(responses: Response[]) {
  const calls: { url: string; options?: RequestInit }[] = [];
  const http: typeof fetch = async (url, options) => {
    calls.push({
      url:
        typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
      options,
    });
    const response = responses.shift();
    assert.ok(response, 'Unexpected extra request');
    return response;
  };
  return {
    calls,
    service: new GlpiTicketService(new GlpiClient(config, http)),
  };
}
const session = () => Response.json({ session_token: 'test-session' });
void test('retrieves a normalized ticket and closes the session', async () => {
  const { calls, service } = fixture([
    session(),
    Response.json({ id: '42', name: 'Route issue', content: 'Details', status: '1', date_creation: '2026-09-14 10:00:00', private_field: 'hidden' }),
    new Response(),
  ]);
  assert.deepEqual(await service.getTicket(42), {
    id: 42, title: 'Route issue', content: 'Details', status: 1, createdAt: '2026-09-14 10:00:00',
  });
  assert.ok(calls[1].url.endsWith('/Ticket/42'));
  assert.ok(calls[2].url.endsWith('/killSession'));
});
void test('invalid ticket ID never opens a session', async () => {
  const { calls, service } = fixture([]);
  for (const id of [0, -1, 1.5, NaN, Infinity]) {
    await assert.rejects(service.getTicket(id), { code: 'GLPI_TICKET_NOT_FOUND' });
  }
  assert.equal(calls.length, 0);
});
void test('ticket and session errors are normalized and sessions released', async () => {
  for (const [status, body, code] of [
    [404, [], 'GLPI_TICKET_NOT_FOUND'],
    [400, ['ERROR_ITEM_NOT_FOUND', 'private'], 'GLPI_TICKET_NOT_FOUND'],
    [400, ['ERROR_SESSION_TOKEN_INVALID', 'private'], 'GLPI_SESSION_ERROR'],
    [401, [], 'GLPI_SESSION_ERROR'],
    [403, [], 'GLPI_FORBIDDEN'],
  ] as const) {
    const { calls, service } = fixture([session(), Response.json(body, { status }), new Response()]);
    await assert.rejects(service.getTicket(42), { code });
    assert.equal(calls.length, 3);
  }
});
void test('unexpected ticket data is not exposed', async () => {
  for (const data of [{}, { id: true, name: 'a', content: 'b' }, { id: 1, name: null, content: 'b' }]) {
    const { service } = fixture([session(), Response.json(data), new Response()]);
    await assert.rejects(service.getTicket(1), { code: 'GLPI_INVALID_RESPONSE' });
  }
});
void test('config requires explicit V1, URL, user token and bounded timeout', () => {
  for (const data of [
    {},
    { ...env, GLPI_API_VERSION: 'v2' },
    { ...env, GLPI_BASE_URL: '' },
    { ...env, GLPI_USER_TOKEN: '' },
    { ...env, GLPI_TIMEOUT_MS: 'Infinity' },
    { ...env, GLPI_TIMEOUT_MS: '999' },
    { ...env, GLPI_TIMEOUT_MS: '30001' },
    { ...env, GLPI_TICKET_CREATE_TIMEOUT_MS: '999' },
    { ...env, GLPI_TICKET_CREATE_TIMEOUT_MS: '30001' },
    { ...env, GLPI_BASE_URL: 'https://user:password@example.invalid' },
    { ...env, GLPI_BASE_URL: 'https://example.invalid/api.php/v2' },
  ]) {
    assert.throws(() => readGlpiConfig(data), { code: 'GLPI_CONFIG_ERROR' });
  }
  assert.equal(readGlpiConfig({ ...env, GLPI_APP_TOKEN: '' }).appToken, '');
  assert.equal(readGlpiConfig(env).ticketCreateTimeoutMs, 20000);
});
void test('validates payload before starting a session', async () => {
  const { calls, service } = fixture([]);
  for (const value of [
    null,
    [],
    {},
    { ...input, title: ' ' },
    { ...input, content: 3 },
    { ...input, title: 'x'.repeat(256) },
    { ...input, content: 'x'.repeat(10001) },
    { ...input, entities_id: 1 },
  ]) {
    await assert.rejects(service.createTicket(value), {
      code: 'GLPI_VALIDATION_ERROR',
    });
  }
  assert.equal(calls.length, 0);
  assert.deepEqual(validateTicket({ title: ' a ', content: ' b ' }), {
    title: 'a',
    content: 'b',
  });
});
void test('connection initializes and closes session without creating ticket', async () => {
  const { calls, service } = fixture([
    session(),
    Response.json({ id: 1 }),
    new Response(),
  ]);
  await service.testConnection();
  assert.deepEqual(
    calls.map((call) => call.url.split('/').pop()),
    ['initSession', 'getActiveProfile', 'killSession'],
  );
});
void test('creates ticket, normalizes ID, separates auth headers and closes session', async () => {
  const { calls, service } = fixture([
    session(),
    Response.json(
      { id: '12345', message: 'do not expose', token: 'secret' },
      { status: 201 },
    ),
    new Response(),
  ]);
  assert.deepEqual(await service.createTicket(input), { id: 12345 });
  assert.equal(
    new Headers(calls[0].options?.headers).get('Authorization'),
    'user_token test-user',
  );
  assert.equal(
    new Headers(calls[1].options?.headers).get('Authorization'),
    null,
  );
  assert.equal(
    new Headers(calls[1].options?.headers).get('Session-Token'),
    'test-session',
  );
  assert.equal(
    new Headers(calls[1].options?.headers).get('App-Token'),
    'test-app',
  );
  assert.equal(
    calls[1].options?.body,
    JSON.stringify({ input: { name: input.title, content: input.content } }),
  );
  assert.equal(calls[1].options?.redirect, 'manual');
  assert.equal(calls[2].url, `${config.baseUrl}/killSession`);
});
void test('refuses redirects without following them', async () => {
  const { calls, service } = fixture([
    new Response(null, {
      status: 302,
      headers: { Location: 'https://example.invalid/login' },
    }),
  ]);
  await assert.rejects(service.testConnection(), {
    code: 'GLPI_CONNECTION_ERROR',
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options?.redirect, 'manual');
});
void test('maps upstream HTTP errors without exposing upstream body', async () => {
  for (const [status, code] of [
    [401, 'GLPI_AUTH_ERROR'],
    [403, 'GLPI_FORBIDDEN'],
    [404, 'GLPI_NOT_FOUND'],
    [500, 'GLPI_CONNECTION_ERROR'],
  ] as const) {
    const { service } = fixture([
      new Response('secret-token-stack', { status }),
    ]);
    await assert.rejects(service.testConnection(), { code });
  }
  assert.equal(
    JSON.stringify(glpiFailure(new Error('secret-token-stack'))).includes(
      'secret-token-stack',
    ),
    false,
  );
});
void test('creation failure closes session and never retries POST', async () => {
  const { calls, service } = fixture([
    session(),
    new Response('private', { status: 500 }),
    new Response(),
  ]);
  await assert.rejects(service.createTicket(input), {
    code: 'GLPI_TICKET_UNCERTAIN',
  });
  assert.equal(
    calls.filter((call) => call.options?.method === 'POST').length,
    1,
  );
  assert.ok(calls[2].url.endsWith('/killSession'));
});
void test('unexpected responses fail safely and release session', async () => {
  for (const response of [
    new Response('<html>login</html>'),
    Response.json({}),
    Response.json({ id: -1 }),
    Response.json({ id: null }),
  ]) {
    const { calls, service } = fixture([session(), response, new Response()]);
    await assert.rejects(service.createTicket(input), {
      code: 'GLPI_TICKET_UNCERTAIN',
    });
    assert.equal(calls.length, 3);
  }
  const { service } = fixture([Response.json({ session_token: '' })]);
  await assert.rejects(service.testConnection(), {
    code: 'GLPI_INVALID_RESPONSE',
  });
});
void test('cleanup failure preserves created ticket ID', async () => {
  const { service } = fixture([
    session(),
    Response.json({ id: 7 }),
    new Response('private', { status: 500 }),
  ]);
  assert.deepEqual(await service.createTicket(input), { id: 7 });
});
void test('network and timeout are mapped, including slow response body', async () => {
  const offline: typeof fetch = async () => {
    throw new Error('private network address');
  };
  await assert.rejects(new GlpiClient(config, offline).initSession(), {
    code: 'GLPI_CONNECTION_ERROR',
  });
  const pending: typeof fetch = async (_url, options) =>
    new Promise((_resolve, reject) => {
      options?.signal?.addEventListener(
        'abort',
        () => reject(new Error('aborted')),
        { once: true },
      );
    });
  await assert.rejects(
    new GlpiClient({ ...config, timeoutMs: 10 }, pending).initSession(),
    { code: 'GLPI_TIMEOUT' },
  );
  const slowBody: typeof fetch = async (_url, options) =>
    new Response(
      new ReadableStream({
        start(controller) {
          options?.signal?.addEventListener(
            'abort',
            () => controller.error(new Error('aborted')),
            { once: true },
          );
        },
      }),
    );
  await assert.rejects(
    new GlpiClient({ ...config, timeoutMs: 10 }, slowBody).initSession(),
    { code: 'GLPI_TIMEOUT' },
  );
});

void test('ticket POST timeout is uncertain and the client never retries it', async () => {
  let calls = 0;
  const http: typeof fetch = async (_url, options) => {
    calls += 1;
    if (calls === 1) return session();
    if (calls === 2) {
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    }
    return new Response();
  };
  const service = new GlpiTicketService(
    new GlpiClient({ ...config, timeoutMs: 1000, ticketCreateTimeoutMs: 10 }, http),
  );
  await assert.rejects(service.createTicket(input), { code: 'GLPI_TICKET_UNCERTAIN' });
  assert.equal(calls, 3); // initSession, exactly one Ticket POST, then killSession
});

void test('ticket creation uses its longer timeout without extending session and read timeouts', async () => {
  let calls = 0;
  const http: typeof fetch = async (_url, _options) => {
    calls += 1;
    if (calls === 1) return session();
    if (calls === 2) {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return Response.json({ id: 12345 }, { status: 201 });
    }
    return new Response();
  };
  const service = new GlpiTicketService(
    new GlpiClient({ ...config, timeoutMs: 10, ticketCreateTimeoutMs: 100 }, http),
  );

  assert.deepEqual(await service.createTicket(input), { id: 12345 });
  assert.equal(calls, 3);
});
