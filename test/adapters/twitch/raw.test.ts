import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEmoteOffsets } from '../../../src/adapters/twitch/raw.ts';
import {
  mapTwitch,
  type TwitchRawMessage,
} from '../../../src/adapters/twitch/map.ts';

test('parses a single emote range', () => {
  assert.deepEqual(parseEmoteOffsets(new Map([['28087', ['0-6']]])), [
    { id: '28087', start: 0, end: 6 },
  ]);
});

test('parses a repeated emote into one entry per position', () => {
  assert.deepEqual(parseEmoteOffsets(new Map([['25', ['0-4', '6-10']]])), [
    { id: '25', start: 0, end: 4 },
    { id: '25', start: 6, end: 10 },
  ]);
});

test('skips malformed ranges', () => {
  assert.deepEqual(parseEmoteOffsets(new Map([['25', ['a-b', '0-4']]])), [
    { id: '25', start: 0, end: 4 },
  ]);
});

test('real message: emote at the end after accented text', () => {
  const text = `"elle est de 80 oui elle a 30 ans" t'es dans le déni Clemitch :(`;
  const raw: TwitchRawMessage = {
    id: 'real-1',
    channel: 'clemovitch',
    userId: '1',
    login: 'viewer',
    displayName: 'viewer',
    color: null,
    isBroadcaster: false,
    isMod: false,
    isVip: false,
    isSubscriber: false,
    text,
    emotes: parseEmoteOffsets(new Map([['555555558', ['62-63']]])),
    timestamp: 0,
  };
  const msg = mapTwitch(raw, () => false);
  const last = msg.parts.at(-1);
  assert.equal(last?.kind, 'emote');
  assert.equal(last?.kind === 'emote' ? last.name : undefined, ':(');
});
