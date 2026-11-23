import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createKickTokenProvider } from '../../../src/adapters/kick/token.ts';

const HOUR_S = 3600;

function tokenResponse(token: string, expiresIn = HOUR_S): Response {
  return new Response(
    JSON.stringify({ access_token: token, expires_in: expiresIn }),
    {
      status: 200,
    },
  );
}

function fakeFetch(...responses: Response[]) {
  const calls: RequestInit[] = [];
  const fetchFn = (async (
    _input: string | URL | Request,
    init?: RequestInit,
  ) => {
    calls.push(init ?? {});
    const next = responses.shift();
    if (!next) throw new Error('fakeFetch: no response queued');
    return next;
  }) as typeof fetch;
  return { fetchFn, calls };
}

function setup(...responses: Response[]) {
  let time = 0;
  const { fetchFn, calls } = fakeFetch(...responses);
  const getToken = createKickTokenProvider({
    clientId: 'id',
    clientSecret: 'super-secret',
    fetchFn,
    now: () => time,
  });
  return {
    getToken,
    calls,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

test('fetches a token using the client credentials grant', async () => {
  const { getToken, calls } = setup(tokenResponse('t1'));
  assert.equal(await getToken(), 't1');
  assert.match(String(calls[0]?.body), /grant_type=client_credentials/);
});

test('reuses the cached token while it is still valid', async () => {
  const { getToken, calls, advance } = setup(tokenResponse('t1'));
  await getToken();
  advance(30 * 60_000);
  assert.equal(await getToken(), 't1');
  assert.equal(calls.length, 1);
});

test('fetches a new token inside the 60-second refresh margin', async () => {
  const { getToken, calls, advance } = setup(
    tokenResponse('t1'),
    tokenResponse('t2'),
  );
  await getToken();
  advance(HOUR_S * 1000 - 30_000);
  assert.equal(await getToken(), 't2');
  assert.equal(calls.length, 2);
});

test('concurrent calls share a single request', async () => {
  const { getToken, calls } = setup(tokenResponse('t1'));
  const [a, b] = await Promise.all([getToken(), getToken()]);
  assert.equal(a, 't1');
  assert.equal(b, 't1');
  assert.equal(calls.length, 1);
});

test('an HTTP error reports the status but never the secret', async () => {
  const { getToken } = setup(new Response('denied', { status: 401 }));
  await assert.rejects(getToken(), (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.match(err.message, /HTTP 401/);
    assert.doesNotMatch(err.message, /super-secret/);
    return true;
  });
});

test('a failed request does not block the next attempt', async () => {
  const { getToken } = setup(
    new Response('error', { status: 500 }),
    tokenResponse('t1'),
  );
  await assert.rejects(getToken());
  assert.equal(await getToken(), 't1');
});

test('rejects a response missing access_token', async () => {
  const { getToken } = setup(new Response(JSON.stringify({}), { status: 200 }));
  await assert.rejects(getToken(), /missing access_token/);
});
