import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import {
  KickAdapter,
  type SubscriptionStore,
} from '../../../src/adapters/kick/adapter.ts';
import { KickVerifier } from '../../../src/adapters/kick/verify.ts';
import type { ChatEvent } from '../../../src/types.ts';

const NOW = Date.parse('2026-11-25T12:00:00Z');
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});

class FakeStore implements SubscriptionStore {
  existing: { id: string; broadcasterId: string }[] = [];
  created: string[] = [];
  removed: string[] = [];
  #next = 1;

  async list() {
    return this.existing;
  }
  async create(broadcasterId: string) {
    this.created.push(broadcasterId);
    return `sub-${this.#next++}`;
  }
  async remove(subscriptionId: string) {
    this.removed.push(subscriptionId);
  }
}

function setup(key: KeyObject | null = publicKey) {
  const store = new FakeStore();
  const adapter = new KickAdapter({
    subscriptions: store,
    publicKey: { get: async () => key },
    verifier: new KickVerifier({ now: () => NOW }),
    isKnownBot: (login) => login === 'botrix',
    now: () => NOW,
  });
  const events: ChatEvent[] = [];
  adapter.onEvent((event) => events.push(event));
  return { adapter, store, events };
}

let messageCounter = 0;

function chatPayload(broadcasterId: number, sender = 'viewer') {
  return {
    message_id: `msg-${++messageCounter}`,
    broadcaster: { user_id: broadcasterId, username: 'streamer' },
    sender: {
      user_id: 42,
      username: sender,
      channel_slug: sender,
      identity: { username_color: '#00FF00', badges: [] },
    },
    content: 'hello [emote:37226:KEKW]',
    created_at: '2026-11-25T11:59:59Z',
  };
}

/** A delivery signed the way Kick signs it. */
function delivery(
  payload: unknown,
  overrides: Partial<Record<string, string>> = {},
): { headers: IncomingHttpHeaders; body: Buffer } {
  const body = Buffer.from(JSON.stringify(payload));
  const id = overrides.id ?? `delivery-${++messageCounter}`;
  const timestamp = new Date(NOW).toISOString();
  const signature = sign(
    'sha256',
    Buffer.concat([Buffer.from(`${id}.${timestamp}.`), body]),
    privateKey,
  ).toString('base64');
  return {
    body,
    headers: {
      'kick-event-message-id': id,
      'kick-event-message-timestamp': timestamp,
      'kick-event-signature': overrides.signature ?? signature,
      'kick-event-type': overrides.type ?? 'chat.message.sent',
    },
  };
}

test('start clears subscriptions left over from a previous run', async () => {
  const { adapter, store } = setup();
  store.existing = [
    { id: 'old-1', broadcasterId: '1' },
    { id: 'old-2', broadcasterId: '2' },
  ];
  await adapter.start();
  assert.deepEqual(store.removed, ['old-1', 'old-2']);
});

test('start survives Kick being unreachable', async () => {
  const { adapter, store } = setup();
  store.list = async () => {
    throw new Error('down');
  };
  await adapter.start(); // must not throw
});

test('join subscribes once; leave removes that subscription', async () => {
  const { adapter, store } = setup();
  await adapter.join('123');
  await adapter.join('123');
  assert.deepEqual(store.created, ['123']);

  await adapter.leave('123');
  assert.deepEqual(store.removed, ['sub-1']);
});

test('leaving a channel never joined does nothing', async () => {
  const { adapter, store } = setup();
  await adapter.leave('999');
  assert.deepEqual(store.removed, []);
});

test('a signed chat delivery for a joined channel becomes a chat event', async () => {
  const { adapter, events } = setup();
  await adapter.join('123');

  const { headers, body } = delivery(chatPayload(123));
  await adapter.handleWebhook(headers, body);

  assert.equal(events.length, 1);
  const [event] = events;
  assert.equal(event?.type, 'chat');
  assert.equal(event?.platform, 'kick');
  assert.equal(event?.channel, '123');
  if (event?.type === 'chat') assert.equal(event.text, 'hello KEKW');
});

test('known bots are flagged', async () => {
  const { adapter, events } = setup();
  await adapter.join('123');
  const { headers, body } = delivery(chatPayload(123, 'botrix'));
  await adapter.handleWebhook(headers, body);
  const [event] = events;
  assert.equal(event?.type === 'chat' && event.isBot, true);
});

test('chat for a channel not joined is dropped', async () => {
  const { adapter, events } = setup();
  const { headers, body } = delivery(chatPayload(123));
  await adapter.handleWebhook(headers, body);
  assert.equal(events.length, 0);
});

test('a bad signature is dropped', async () => {
  const { adapter, events } = setup();
  await adapter.join('123');
  const { headers, body } = delivery(chatPayload(123), {
    signature: Buffer.from('forged').toString('base64'),
  });
  await adapter.handleWebhook(headers, body);
  assert.equal(events.length, 0);
});

test('a replayed delivery is dropped the second time', async () => {
  const { adapter, events } = setup();
  await adapter.join('123');
  const { headers, body } = delivery(chatPayload(123), { id: 'same' });
  await adapter.handleWebhook(headers, body);
  await adapter.handleWebhook(headers, body);
  assert.equal(events.length, 1);
});

test('deliveries are dropped until the public key has loaded', async () => {
  const { adapter, events } = setup(null);
  await adapter.join('123');
  const { headers, body } = delivery(chatPayload(123));
  await adapter.handleWebhook(headers, body);
  assert.equal(events.length, 0);
});

test('other event types and malformed bodies are ignored without throwing', async () => {
  const { adapter, events } = setup();
  await adapter.join('123');

  const followed = delivery(chatPayload(123), { type: 'channel.followed' });
  await adapter.handleWebhook(followed.headers, followed.body);

  const garbage = delivery({ not: 'chat' });
  await adapter.handleWebhook(garbage.headers, garbage.body);

  assert.equal(events.length, 0);
});