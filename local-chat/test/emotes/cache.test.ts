import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EmoteCache } from '../../src/emotes/cache.ts';

const BTTV_GLOBAL = 'https://api.betterttv.net/3/cached/emotes/global';
const SEVENTV_GLOBAL = 'https://7tv.io/v3/emote-sets/global';
const bttvChannel = (id: string) =>
  `https://api.betterttv.net/3/cached/users/twitch/${id}`;
const sevenTvChannel = (id: string) => `https://7tv.io/v3/users/twitch/${id}`;

function sevenTvUser(name: string, emoteId: string) {
  return {
    emote_set: {
      emotes: [
        { name, data: { host: { url: `//cdn.7tv.app/emote/${emoteId}` } } },
      ],
    },
  };
}

function setup(routes: Record<string, unknown>) {
  let time = 0;
  const calls: string[] = [];
  const warnings: string[] = [];
  const fetchFn = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (!(url in routes)) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(routes[url]), { status: 200 });
  }) as typeof fetch;

  const cache = new EmoteCache({
    fetchFn,
    now: () => time,
    ttlMs: 60_000,
    warn: (message) => warnings.push(message),
  });
  return {
    cache,
    calls,
    warnings,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

test('returns nothing at first, then the emotes once loaded', async () => {
  const { cache } = setup({ [sevenTvChannel('1')]: sevenTvUser('HUSS', 'h1') });
  assert.equal(cache.lookup('1').size, 0);
  await cache.refresh('1');
  assert.equal(
    cache.lookup('1').get('HUSS'),
    'https://cdn.7tv.app/emote/h1/2x.webp',
  );
});

test('a channel 7TV emote beats a BTTV global with the same name', async () => {
  const { cache } = setup({
    [BTTV_GLOBAL]: [{ id: 'bttv-id', code: 'Clash' }],
    [sevenTvChannel('1')]: sevenTvUser('Clash', 'seven-id'),
  });
  await cache.refresh('1');
  assert.equal(
    cache.lookup('1').get('Clash'),
    'https://cdn.7tv.app/emote/seven-id/2x.webp',
  );
});

test('one provider failing does not stop the others', async () => {
  const { cache, warnings } = setup({
    [bttvChannel('1')]: {
      channelEmotes: [{ id: 'k1', code: 'kliksJAM' }],
      sharedEmotes: [],
    },
  });
  await cache.refresh('1');
  assert.ok(cache.lookup('1').has('kliksJAM'));
  assert.ok(warnings.length > 0);
});

test('does not refetch while fresh, refetches once stale', async () => {
  const { cache, calls, advance } = setup({});
  await cache.refresh('1');
  const afterFirstLoad = calls.length;

  cache.lookup('1');
  assert.equal(calls.length, afterFirstLoad);

  advance(60_000);
  cache.lookup('1');
  await cache.refresh('1');
  assert.ok(calls.length > afterFirstLoad);
});

test('global sets are fetched once for several channels', async () => {
  const { cache, calls } = setup({});
  await cache.refresh('1');
  await cache.refresh('2');
  assert.equal(calls.filter((url) => url === SEVENTV_GLOBAL).length, 1);
});

test('forget drops a channel', async () => {
  const { cache } = setup({ [sevenTvChannel('1')]: sevenTvUser('HUSS', 'h1') });
  await cache.refresh('1');
  cache.forget('1');
  assert.equal(cache.lookup('1').size, 0);
});
