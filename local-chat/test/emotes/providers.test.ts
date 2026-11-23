import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBttvChannel,
  parseBttvGlobal,
  parse7tvSet,
  parse7tvUser,
  parseFfz,
} from '../../src/emotes/providers.ts';

test('BTTV global: maps code to a CDN URL', () => {
  const lookup = parseBttvGlobal([
    { id: '54fa8f1401e468494b85b537', code: ':tf:' },
  ]);
  assert.equal(
    lookup.get(':tf:'),
    'https://cdn.betterttv.net/emote/54fa8f1401e468494b85b537/2x',
  );
});

test('BTTV channel: includes both channel and shared emotes', () => {
  const lookup = parseBttvChannel({
    channelEmotes: [{ id: '5fc590340adab746185872f4', code: 'kliksJAM' }],
    sharedEmotes: [{ id: '55c4cd66130b3c721ae66100', code: 'xD' }],
  });
  assert.equal(lookup.size, 2);
  assert.ok(lookup.has('kliksJAM'));
  assert.ok(lookup.has('xD'));
});

test('FFZ: uses the 2x image', () => {
  const lookup = parseFfz([
    {
      code: 'Pepeg',
      images: {
        '1x': 'https://cdn.betterttv.net/frankerfacez_emote/344688/1',
        '2x': 'https://cdn.betterttv.net/frankerfacez_emote/344688/2',
      },
    },
  ]);
  assert.equal(
    lookup.get('Pepeg'),
    'https://cdn.betterttv.net/frankerfacez_emote/344688/2',
  );
});

test('FFZ: falls back to 1x when there is no 2x', () => {
  const lookup = parseFfz([
    { code: 'Small', images: { '1x': 'https://ffz/small/1' } },
  ]);
  assert.equal(lookup.get('Small'), 'https://ffz/small/1');
});

test('7TV channel: builds an https URL from the protocol-relative host', () => {
  const lookup = parse7tvUser({
    emote_set: {
      emotes: [
        {
          name: 'Thinking',
          data: {
            name: 'Thinking',
            host: { url: '//cdn.7tv.app/emote/01EZT9WTYR0002GHH6006GD23G' },
          },
        },
      ],
    },
  });
  assert.equal(
    lookup.get('Thinking'),
    'https://cdn.7tv.app/emote/01EZT9WTYR0002GHH6006GD23G/2x.webp',
  );
});

test('7TV: uses the channel alias, not the original name', () => {
  const lookup = parse7tvSet({
    emotes: [
      {
        name: 'Renamed',
        data: { name: 'Original', host: { url: '//cdn.7tv.app/emote/x' } },
      },
    ],
  });
  assert.ok(lookup.has('Renamed'));
  assert.ok(!lookup.has('Original'));
});

test('skips malformed entries but keeps valid ones', () => {
  const lookup = parseBttvGlobal([
    { code: 'NoId' },
    null,
    'junk',
    { id: 'abc', code: 'Good' },
  ]);
  assert.deepEqual([...lookup.keys()], ['Good']);
});

test('returns an empty lookup for a response of the wrong shape', () => {
  assert.equal(parseBttvGlobal({ error: 'down' }).size, 0);
  assert.equal(parseBttvChannel(null).size, 0);
  assert.equal(parseFfz('garbage').size, 0);
  assert.equal(parse7tvUser(undefined).size, 0);
});
