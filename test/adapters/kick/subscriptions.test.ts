import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KICK_SUBSCRIPTIONS_URL,
  KickSubscriptions,
} from '../../../src/adapters/kick/subscriptions.ts';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function fakeFetch(respond: (call: Call) => Response) {
  const calls: Call[] = [];
  const fetchFn = (async (input: string | URL, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
  return { calls, fetchFn };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const api = (fetchFn: typeof fetch) =>
  new KickSubscriptions({ getToken: async () => 'tok', fetchFn });

test('create posts a chat webhook subscription and returns its ID', async () => {
  const { calls, fetchFn } = fakeFetch(() =>
    json({ data: [{ name: 'chat.message.sent', subscription_id: 'sub-1' }] }),
  );

  assert.equal(await api(fetchFn).create('123'), 'sub-1');

  const [call] = calls;
  assert.equal(call?.method, 'POST');
  assert.equal(call?.url, KICK_SUBSCRIPTIONS_URL);
  assert.equal(call?.headers.Authorization, 'Bearer tok');
  assert.deepEqual(call?.body, {
    broadcaster_user_id: 123,
    events: [{ name: 'chat.message.sent', version: 1 }],
    method: 'webhook',
  });
});

test('create fails loudly when Kick returns no subscription ID', async () => {
  const { fetchFn } = fakeFetch(() =>
    json({ data: [{ name: 'chat.message.sent', error: 'not allowed' }] }),
  );
  await assert.rejects(api(fetchFn).create('123'), /not allowed/);
});

test('an HTTP error is reported with its status', async () => {
  const { fetchFn } = fakeFetch(() => json({}, 401));
  await assert.rejects(api(fetchFn).create('123'), /HTTP 401/);
});

test('list keeps only chat subscriptions with usable fields', async () => {
  const { fetchFn } = fakeFetch(() =>
    json({
      data: [
        { id: 'a', event: 'chat.message.sent', broadcaster_user_id: 1 },
        { id: 'b', event: 'channel.followed', broadcaster_user_id: 2 },
        { id: 'c', event: 'chat.message.sent', broadcaster_user_id: 'x' },
        { event: 'chat.message.sent', broadcaster_user_id: 3 },
      ],
    }),
  );
  assert.deepEqual(await api(fetchFn).list(), [
    { id: 'a', broadcasterId: '1' },
  ]);
});

test('remove deletes by ID and accepts an empty 204 reply', async () => {
  const { calls, fetchFn } = fakeFetch(
    () => new Response(null, { status: 204 }),
  );
  await api(fetchFn).remove('sub-1');
  assert.equal(calls[0]?.method, 'DELETE');
  assert.equal(calls[0]?.url, `${KICK_SUBSCRIPTIONS_URL}?id=sub-1`);
});
