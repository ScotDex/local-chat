import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AvatarLookup } from '../../overlay/core/avatars.js';

const LOGO = 'https://static-cdn.jtvnw.net/jtv_user_pictures/pilot-300x300.png';

function setup(bodies: Record<string, unknown>) {
  const calls: string[] = [];
  const waits: number[] = [];
  const fetchFn = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const login = new URL(url).searchParams.get('login') ?? '';
    if (!(login in bodies)) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(bodies[login]), { status: 200 });
  }) as typeof fetch;
  const lookup = new AvatarLookup({
    fetchFn,
    wait: async (ms) => {
      waits.push(ms);
    },
  });
  return { lookup, calls, waits };
}

test('finds an avatar from a list response', async () => {
  const { lookup } = setup({ pilot: [{ logo: LOGO }] });
  const found: string[] = [];
  lookup.request('pilot', (url) => found.push(url));
  await lookup.whenIdle();
  assert.deepEqual(found, [LOGO]);
});

test('also accepts a single-object response', async () => {
  const { lookup } = setup({ pilot: { logo: LOGO } });
  const found: string[] = [];
  lookup.request('pilot', (url) => found.push(url));
  await lookup.whenIdle();
  assert.deepEqual(found, [LOGO]);
});

test('a known avatar is answered without another lookup', async () => {
  const { lookup, calls } = setup({ pilot: [{ logo: LOGO }] });
  lookup.request('pilot', () => undefined);
  await lookup.whenIdle();
  const found: string[] = [];
  lookup.request('pilot', (url) => found.push(url));
  assert.deepEqual(found, [LOGO]);
  assert.equal(calls.length, 1);
});

test('a user with no avatar is never looked up twice', async () => {
  const { lookup, calls } = setup({});
  let called = false;
  lookup.request('nobody', () => {
    called = true;
  });
  await lookup.whenIdle();
  lookup.request('nobody', () => {
    called = true;
  });
  await lookup.whenIdle();
  assert.equal(called, false);
  assert.equal(calls.length, 1);
});

test('lookups are spaced out', async () => {
  const { lookup, waits } = setup({ a: [{ logo: LOGO }], b: [{ logo: LOGO }] });
  lookup.request('a', () => undefined);
  lookup.request('b', () => undefined);
  await lookup.whenIdle();
  assert.deepEqual(waits, [350]);
});

test('ignores avatar addresses that are not https', async () => {
  const { lookup } = setup({ pilot: [{ logo: 'javascript:alert(1)' }] });
  let called = false;
  lookup.request('pilot', () => {
    called = true;
  });
  await lookup.whenIdle();
  assert.equal(called, false);
});

test('a failed lookup leaves the portrait as an initial', async () => {
  const fetchFn = (async () => {
    throw new Error('offline');
  }) as typeof fetch;
  const lookup = new AvatarLookup({ fetchFn, wait: async () => undefined });
  let called = false;
  lookup.request('pilot', () => {
    called = true;
  });
  await lookup.whenIdle();
  assert.equal(called, false);
});
