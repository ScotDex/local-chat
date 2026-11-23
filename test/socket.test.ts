import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';
import {
  createSocketServer,
  MAX_CHANNELS_PER_CONNECTION,
} from '../src/socket.ts';
import { ChannelRegistry } from '../src/registry.ts';
import type { ChatMessage } from '../src/types.ts';
import { FakeAdapter } from './helpers/fakeAdapter.ts';

const twitch = (channel: string) => ({ platform: 'twitch', channel });

function chatIn(channel: string): ChatMessage {
  return {
    type: 'chat',
    platform: 'twitch',
    channel,
    id: 'm1',
    userId: '1',
    login: 'viewer',
    name: 'Viewer',
    color: null,
    avatarUrl: null,
    roles: [],
    isBot: false,
    text: 'hello',
    parts: [{ kind: 'text', text: 'hello' }],
    timestamp: 0,
  };
}

async function startServer(t: TestContext) {
  const adapter = new FakeAdapter();
  const registry = new ChannelRegistry([adapter], { graceMs: 0 });
  const httpServer = createServer();
  const io = createSocketServer({ httpServer, registry, adapters: [adapter] });
  httpServer.listen(0);
  await once(httpServer, 'listening');
  const { port } = httpServer.address() as AddressInfo;

  const clients: ClientSocket[] = [];
  t.after(async () => {
    for (const client of clients) client.disconnect();
    registry.dispose();
    await io.close();
  });

  const client = (): ClientSocket => {
    const socket = connect(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
    });
    clients.push(socket);
    return socket;
  };
  return { adapter, client };
}

test('a valid subscription joins the normalised channel', async (t) => {
  const { adapter, client } = await startServer(t);
  const response = await client().emitWithAck('subscribe', twitch('Limmy'));
  assert.deepEqual(response, { ok: true });
  assert.deepEqual(adapter.joins, ['limmy']);
});

test('an invalid subscription is refused without joining', async (t) => {
  const { adapter, client } = await startServer(t);
  const response = await client().emitWithAck('subscribe', twitch('bad name!'));
  assert.equal(response.ok, false);
  assert.deepEqual(adapter.joins, []);
});

test('events reach subscribers of that channel only', async (t) => {
  const { adapter, client } = await startServer(t);
  const watcher = client();
  const other = client();
  await watcher.emitWithAck('subscribe', twitch('limmy'));
  await other.emitWithAck('subscribe', twitch('somebodyelse'));

  let otherReceived = false;
  other.on('chat-event', () => {
    otherReceived = true;
  });
  const received = new Promise<ChatMessage>((resolve) =>
    watcher.once('chat-event', resolve),
  );

  adapter.emit(chatIn('limmy'));

  assert.equal((await received).channel, 'limmy');
  await delay(50);
  assert.equal(otherReceived, false);
});

test('a duplicate subscription counts as one', async (t) => {
  const { adapter, client } = await startServer(t);
  const socket = client();
  await socket.emitWithAck('subscribe', twitch('limmy'));
  await socket.emitWithAck('subscribe', twitch('limmy'));
  socket.disconnect();
  await delay(100);
  assert.deepEqual(adapter.leaves, ['limmy']);
});

test('a connection is limited in how many channels it can watch', async (t) => {
  const { client } = await startServer(t);
  const socket = client();
  for (let i = 0; i < MAX_CHANNELS_PER_CONNECTION; i++) {
    assert.deepEqual(
      await socket.emitWithAck('subscribe', twitch(`channel${i}`)),
      { ok: true },
    );
  }
  const response = await socket.emitWithAck('subscribe', twitch('onemore'));
  assert.equal(response.ok, false);
});

test('unsubscribing releases the channel', async (t) => {
  const { adapter, client } = await startServer(t);
  const socket = client();
  await socket.emitWithAck('subscribe', twitch('limmy'));
  await socket.emitWithAck('unsubscribe', twitch('limmy'));
  await delay(50);
  assert.deepEqual(adapter.leaves, ['limmy']);
});

test('disconnecting releases the channel', async (t) => {
  const { adapter, client } = await startServer(t);
  const socket = client();
  await socket.emitWithAck('subscribe', twitch('limmy'));
  socket.disconnect();
  await delay(100);
  assert.deepEqual(adapter.leaves, ['limmy']);
});
