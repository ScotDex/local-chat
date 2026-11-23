import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mapTwitch,
  type TwitchRawMessage,
} from '../../../src/adapters/twitch/map.ts';

const noBots = () => false;

function raw(overrides: Partial<TwitchRawMessage> = {}): TwitchRawMessage {
  return {
    id: 'msg-1',
    channel: 'erst',
    userId: '45820553',
    displayName: 'm1d3v1l',
    color: '#0026FF',
    isBroadcaster: false,
    isMod: false,
    isVip: false,
    isSubscriber: false,
    text: 'hello',
    emotes: [],
    timestamp: 1_700_000_000_000,
    ...overrides,
  };
}

test('maps the core fields', () => {
  const msg = mapTwitch(raw(), noBots);
  assert.equal(msg.platform, 'twitch');
  assert.equal(msg.name, 'm1d3v1l');
  assert.equal(msg.userId, '45820553');
  assert.equal(msg.color, '#0026FF');
});

test('lists every role, highest first', () => {
  const msg = mapTwitch(raw({ isSubscriber: true, isMod: true }), noBots);
  assert.deepEqual(msg.roles, ['mod', 'sub']);
});

test('a regular viewer has no roles', () => {
  assert.deepEqual(mapTwitch(raw(), noBots).roles, []);
});

test('a message without emotes is a single text part', () => {
  assert.deepEqual(mapTwitch(raw(), noBots).parts, [
    { kind: 'text', text: 'hello' },
  ]);
});

test('splits text around an emote', () => {
  const msg = mapTwitch(
    raw({ text: 'hi Kappa there', emotes: [{ id: '25', start: 3, end: 7 }] }),
    noBots,
  );
  assert.deepEqual(msg.parts, [
    { kind: 'text', text: 'hi ' },
    {
      kind: 'emote',
      name: 'Kappa',
      url: 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0',
    },
    { kind: 'text', text: ' there' },
  ]);
});

test('counts emoji as one character when placing emotes', () => {
  const msg = mapTwitch(
    raw({ text: '😀 Kappa', emotes: [{ id: '25', start: 2, end: 6 }] }),
    noBots,
  );
  assert.equal(msg.parts[1]?.kind, 'emote');
  assert.deepEqual(msg.parts[0], { kind: 'text', text: '😀 ' });
});

test('leaves out-of-range emote positions as plain text', () => {
  const msg = mapTwitch(
    raw({ text: 'hello', emotes: [{ id: '25', start: 10, end: 14 }] }),
    noBots,
  );
  assert.deepEqual(msg.parts, [{ kind: 'text', text: 'hello' }]);
});

test('flags known bots', () => {
  const isKnownBot = (name: string) => name === 'StreamElements';
  const msg = mapTwitch(
    raw({ displayName: 'StreamElements', isMod: true }),
    isKnownBot,
  );
  assert.equal(msg.isBot, true);
  assert.deepEqual(msg.roles, ['mod']);
});
