import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTick } from 'node:timers/promises';
import {
  startConnection,
  type SocketLike,
} from '../../overlay/core/connection.js';
import type { ChatEvent } from '../../src/types.ts';

class FakeSocket implements SocketLike {
  connectCalled = false;
  disconnectCalled = false;
  sent: unknown[] = [];
  replies: unknown[] = [];
  #handlers = new Map<string, (...args: unknown[]) => void>();

  on(event: string, handler: (...args: unknown[]) => void): this {
    this.#handlers.set(event, handler);
    return this;
  }
  async emitWithAck(_event: string, payload: unknown): Promise<unknown> {
    this.sent.push(payload);
    return this.replies.shift() ?? { ok: true };
  }
  connect(): void {
    this.connectCalled = true;
  }
  disconnect(): void {
    this.disconnectCalled = true;
  }
  /** Test-only: simulate the server or network firing an event. */
  fire(event: string, ...args: unknown[]): void {
    this.#handlers.get(event)?.(...args);
  }
}

const channels = [
  { platform: 'twitch', channel: 'limmy' },
  { platform: 'twitch', channel: 'ohnepixel' },
] as const;

function setup() {
  const socket = new FakeSocket();
  const events: ChatEvent[] = [];
  const statuses: boolean[] = [];
  const errors: string[] = [];
  const connection = startConnection({
    socket,
    channels,
    onEvent: (event) => events.push(event),
    onStatus: (live) => statuses.push(live),
    onError: (message) => errors.push(message),
  });
  return { socket, connection, events, statuses, errors };
}

test('connects only after wiring up its handlers', () => {
  const { socket } = setup();
  assert.equal(socket.connectCalled, true);
});

test('subscribes to every channel on connect', () => {
  const { socket } = setup();
  socket.fire('connect');
  assert.deepEqual(socket.sent, channels);
});

test('subscribes again after a reconnect', () => {
  const { socket } = setup();
  socket.fire('connect');
  socket.fire('disconnect');
  socket.fire('connect');
  assert.equal(socket.sent.length, 4);
});

test('reports connection status', () => {
  const { socket, statuses } = setup();
  socket.fire('connect');
  socket.fire('disconnect');
  assert.deepEqual(statuses, [true, false]);
});

test('passes chat events through', () => {
  const { socket, events } = setup();
  const event = {
    type: 'delete',
    platform: 'twitch',
    channel: 'limmy',
    messageId: 'm1',
  };
  socket.fire('chat-event', event);
  assert.deepEqual(events, [event]);
});

test('reports a refused subscription with the reason', async () => {
  const { socket, errors } = setup();
  socket.replies = [
    { ok: false, error: 'Invalid Twitch channel name' },
    { ok: true },
  ];
  socket.fire('connect');
  await nextTick();
  assert.deepEqual(errors, ['twitch/limmy: Invalid Twitch channel name']);
});

test('stop disconnects', () => {
  const { socket, connection } = setup();
  connection.stop();
  assert.equal(socket.disconnectCalled, true);
});
