import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Roster } from '../../overlay/core/roster.js';
import type { ChatMessage, JoinEvent } from '../../src/types.ts';

function join(login: string, isBot = false): JoinEvent {
  return { type: 'join', platform: 'twitch', channel: 'limmy', login, isBot };
}

function chat(
  login: string,
  overrides: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    type: 'chat',
    platform: 'twitch',
    channel: 'limmy',
    id: `m-${login}`,
    userId: `id-${login}`,
    login,
    name: login,
    color: null,
    avatarUrl: null,
    roles: [],
    isBot: false,
    text: 'o7',
    parts: [{ kind: 'text', text: 'o7' }],
    timestamp: 0,
    ...overrides,
  };
}

function setup(options = {}) {
  let time = 1_000;
  const roster = new Roster({ now: () => time, ...options });
  return {
    roster,
    tick: () => {
      time += 1_000;
    },
    logins: () => roster.entries.map((e) => e.login),
  };
}

test('a join adds a lurker and counts them', () => {
  const { roster } = setup();
  roster.apply(join('lurker'));
  assert.equal(roster.count, 1);
  assert.equal(roster.entries[0]?.spoken, false);
});

test("the connector's own anonymous login is never listed", () => {
  const { roster } = setup();
  assert.equal(roster.apply(join('justinfan12345')), false);
  assert.equal(roster.count, 0);
});

test('bots are left out unless shown', () => {
  assert.equal(setup().roster.apply(join('streamelements', true)), false);
  assert.equal(
    setup({ showBots: true }).roster.apply(join('streamelements', true)),
    true,
  );
});

test('chatting marks a lurker as spoken and keeps their join time', () => {
  const { roster, tick } = setup();
  roster.apply(join('pilot'));
  const joinedAt = roster.entries[0]?.joinedAt;
  tick();
  roster.apply(chat('pilot', { name: 'Pilot', roles: ['mod'] }));
  const entry = roster.entries[0];
  assert.equal(entry?.spoken, true);
  assert.equal(entry?.name, 'Pilot');
  assert.deepEqual(entry?.roles, ['mod']);
  assert.equal(entry?.joinedAt, joinedAt);
});

test('orders chatters first, most recent first, then lurkers by arrival', () => {
  const { roster, tick, logins } = setup();
  roster.apply(join('lurkerOld'));
  tick();
  roster.apply(join('lurkerNew'));
  tick();
  roster.apply(chat('chatterA'));
  tick();
  roster.apply(chat('chatterB'));
  assert.deepEqual(logins(), [
    'chatterB',
    'chatterA',
    'lurkerOld',
    'lurkerNew',
  ]);
});

test('a part removes the viewer', () => {
  const { roster } = setup();
  roster.apply(join('pilot'));
  roster.apply({
    type: 'part',
    platform: 'twitch',
    channel: 'limmy',
    login: 'pilot',
  });
  assert.equal(roster.count, 0);
  assert.equal(roster.entries.length, 0);
});

test('a timeout keeps the viewer; a permanent ban removes them', () => {
  const { roster } = setup();
  roster.apply(chat('troll'));
  const ban = {
    type: 'ban',
    platform: 'twitch',
    channel: 'limmy',
    userId: 'id-troll',
    login: 'troll',
  } as const;
  roster.apply({ ...ban, durationSeconds: 600 });
  assert.equal(roster.count, 1);
  roster.apply({ ...ban, durationSeconds: null });
  assert.equal(roster.count, 0);
});

test('over the limit, extra lurkers are not listed but still counted', () => {
  const { roster, tick, logins } = setup({ maxEntries: 2 });
  for (const login of ['a', 'b', 'c']) {
    roster.apply(join(login));
    tick();
  }
  assert.deepEqual(logins(), ['a', 'b']);
  assert.equal(roster.count, 3);
});

test('hidden names never appear', () => {
  const { roster } = setup({ hiddenNames: ['SomeUser'] });
  assert.equal(roster.apply(join('someuser')), false);
  assert.equal(roster.apply(chat('someuser')), false);
});
