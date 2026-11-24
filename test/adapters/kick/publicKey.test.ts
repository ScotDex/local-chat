import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import {
  KickPublicKey,
  RETRY_AFTER_MS,
} from '../../../src/adapters/kick/publicKey.ts';

const { publicKey: pem } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const goodResponse = () =>
  new Response(JSON.stringify({ data: { public_key: pem } }));

function setup(respond: () => Response) {
  let calls = 0;
  let now = 0;
  const warnings: string[] = [];
  const keys = new KickPublicKey({
    fetchFn: async () => {
      calls++;
      return respond();
    },
    now: () => now,
    warn: (message) => warnings.push(message),
  });
  return {
    keys,
    calls: () => calls,
    warnings,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

test('loads the key once and keeps it', async () => {
  const { keys, calls } = setup(goodResponse);
  const first = await keys.get();
  const second = await keys.get();
  assert.equal(first?.type, 'public');
  assert.equal(second, first);
  assert.equal(calls(), 1);
});

test('simultaneous requests share one load', async () => {
  const { keys, calls } = setup(goodResponse);
  await Promise.all([keys.get(), keys.get(), keys.get()]);
  assert.equal(calls(), 1);
});

test('after a failure, waits before trying again', async () => {
  let fail = true;
  const { keys, calls, advance } = setup(() =>
    fail ? new Response('nope', { status: 503 }) : goodResponse(),
  );

  assert.equal(await keys.get(), null);
  fail = false;
  advance(RETRY_AFTER_MS - 1);
  assert.equal(await keys.get(), null);
  assert.equal(calls(), 1);

  advance(1);
  assert.equal((await keys.get())?.type, 'public');
  assert.equal(calls(), 2);
});

test('a response without a key is reported, not used', async () => {
  const { keys, warnings } = setup(
    () => new Response(JSON.stringify({ data: {} })),
  );
  assert.equal(await keys.get(), null);
  assert.match(warnings[0] ?? '', /no public_key/);
});
