import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChatStore } from '../../overlay/core/store.js';
import type { ChatEvent, ChatMessage } from '../../src/types.ts';

function chat(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    type: 'chat',
    platform: 'twitch',
    channel: 'limmy',
    id: 'm1',
    userId: 'u1',
    name: 'Viewer',
    color: null,
    roles: [],
    isBot: false,
    text: 'hello',
    parts: [{ kind: 'text', text: 'hello' }],
    timestamp: 0,
    ...overrides,
  };
}

test('keeps chat messages in arrival order', () => {
  const store = new ChatStore();
  store.apply(chat({ id: 'a' }));
  store.apply(chat({ id: 'b' }));
  assert.deepEqual(
    store.messages.map((m) => m.id),
    ['a', 'b'],
  );
});

test('drops the oldest message past the limit', () => {
  const store = new ChatStore({ maxMessages: 2 });
  for (const id of ['a', 'b', 'c']) store.apply(chat({ id }));
  assert.deepEqual(
    store.messages.map((m) => m.id),
    ['b', 'c'],
  );
});

test('hides bots by default and shows them when asked', () => {
  const hidden = new ChatStore();
  assert.equal(hidden.apply(chat({ isBot: true })), false);
  assert.equal(hidden.messages.length, 0);

  const shown = new ChatStore({ showBots: true });
  shown.apply(chat({ isBot: true }));
  assert.equal(shown.messages.length, 1);
});

test('a delete removes only that message', () => {
  const store = new ChatStore();
  store.apply(chat({ id: 'a' }));
  store.apply(chat({ id: 'b' }));
  const changed = store.apply({
    type: 'delete',
    platform: 'twitch',
    channel: 'limmy',
    messageId: 'a',
  });
  assert.equal(changed, true);
  assert.deepEqual(
    store.messages.map((m) => m.id),
    ['b'],
  );
});

test('a ban removes all of that user’s messages in that channel only', () => {
  const store = new ChatStore();
  store.apply(chat({ id: 'a', userId: 'troll' }));
  store.apply(chat({ id: 'b', userId: 'troll', channel: 'otherchannel' }));
  store.apply(chat({ id: 'c', userId: 'nice' }));
  store.apply({
    type: 'ban',
    platform: 'twitch',
    channel: 'limmy',
    userId: 'troll',
  });
  assert.deepEqual(
    store.messages.map((m) => m.id),
    ['b', 'c'],
  );
});

test('a delete that matches nothing reports no change', () => {
  const store = new ChatStore();
  store.apply(chat({ id: 'a' }));
  assert.equal(
    store.apply({
      type: 'delete',
      platform: 'twitch',
      channel: 'limmy',
      messageId: 'zzz',
    }),
    false,
  );
});

test('unknown event types are ignored', () => {
  const store = new ChatStore();
  const future = {
    type: 'raid',
    platform: 'twitch',
    channel: 'limmy',
  } as unknown as ChatEvent;
  assert.equal(store.apply(future), false);
});
