import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Presence } from '../src/presence.ts';
import type { JoinEvent } from '../src/types.ts';

function join(login: string, channel = 'limmy'): JoinEvent {
  return { type: 'join', platform: 'twitch', channel, login, isBot: false };
}

const logins = (events: JoinEvent[]) => events.map((e) => e.login);

test('a snapshot lists everyone who joined', () => {
  const presence = new Presence();
  presence.apply(join('a'));
  presence.apply(join('b'));
  assert.deepEqual(logins(presence.snapshot('twitch', 'limmy')), ['a', 'b']);
});

test('a part removes them', () => {
  const presence = new Presence();
  presence.apply(join('a'));
  presence.apply({
    type: 'part',
    platform: 'twitch',
    channel: 'limmy',
    login: 'a',
  });
  assert.deepEqual(presence.snapshot('twitch', 'limmy'), []);
});

test('each channel has its own list', () => {
  const presence = new Presence();
  presence.apply(join('a', 'limmy'));
  presence.apply(join('b', 'magicalgeek'));
  assert.deepEqual(logins(presence.snapshot('twitch', 'magicalgeek')), ['b']);
});

test('a repeated join is listed once', () => {
  const presence = new Presence();
  presence.apply(join('a'));
  presence.apply(join('a'));
  assert.equal(presence.snapshot('twitch', 'limmy').length, 1);
});

test('forget empties a channel', () => {
  const presence = new Presence();
  presence.apply(join('a'));
  presence.forget('twitch', 'limmy');
  assert.deepEqual(presence.snapshot('twitch', 'limmy'), []);
});
