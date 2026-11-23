import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ChatMessage as TwurpleChatMessage } from '@twurple/chat';
import {
  TwitchAdapter,
  type EmoteSource,
  type TwitchChatSource,
} from '../../../src/adapters/twitch/adapter.ts';
import type { ChatEvent } from '../../../src/types.ts';

type MessageHandler = (
  channel: string,
  user: string,
  text: string,
  msg: TwurpleChatMessage,
) => void;

class FakeChat implements TwitchChatSource {
  connected = false;
  quitCalled = false;
  joined: string[] = [];
  parted: string[] = [];
  #handler: MessageHandler | null = null;

  connect(): void {
    this.connected = true;
  }
  quit(): void {
    this.quitCalled = true;
  }
  async join(channel: string): Promise<void> {
    this.joined.push(channel);
  }
  part(channel: string): void {
    this.parted.push(channel);
  }
  onMessage(handler: MessageHandler): void {
    this.#handler = handler;
  }
  receive(channel: string, text: string, msg: TwurpleChatMessage): void {
    this.#handler?.(channel, 'user', text, msg);
  }
}

// Twurple's message is a class instance; the adapter only reads these fields
function fakeMessage(
  channelId: string | null = '43683025',
): TwurpleChatMessage {
  return {
    id: 'm1',
    channelId,
    date: new Date(0),
    emoteOffsets: new Map(),
    userInfo: {
      userId: '1',
      displayName: 'Viewer',
      color: '',
      isBroadcaster: false,
      isMod: false,
      isVip: false,
      isSubscriber: false,
    },
  } as unknown as TwurpleChatMessage;
}

const HUSS_URL = 'https://cdn.7tv.app/emote/h1/2x.webp';

function setup() {
  const chat = new FakeChat();
  const forgotten: string[] = [];
  const emotes: EmoteSource = {
    lookup: () => new Map([['HUSS', HUSS_URL]]),
    forget: (id) => {
      forgotten.push(id);
    },
  };
  const adapter = new TwitchAdapter(chat, { isKnownBot: () => false, emotes });
  const events: ChatEvent[] = [];
  adapter.onEvent((event) => events.push(event));
  return { chat, adapter, events, forgotten };
}

test('start connects and stop quits', async () => {
  const { chat, adapter } = setup();
  await adapter.start();
  await adapter.stop();
  assert.equal(chat.connected, true);
  assert.equal(chat.quitCalled, true);
});

test('join and leave use the lowercase channel name', async () => {
  const { chat, adapter } = setup();
  await adapter.join('Limmy');
  await adapter.leave('Limmy');
  assert.deepEqual(chat.joined, ['limmy']);
  assert.deepEqual(chat.parted, ['limmy']);
});

test('an incoming Twitch message is emitted as a chat event', () => {
  const { chat, events } = setup();
  chat.receive('limmy', 'hello', fakeMessage());
  assert.equal(events.length, 1);
  assert.equal(events[0]?.type, 'chat');
  assert.equal(events[0]?.platform, 'twitch');
});

test('third-party emotes are added to chat messages', () => {
  const { chat, events } = setup();
  chat.receive('ohnepixel', 'HUSS HUSS', fakeMessage());
  const event = events[0];
  assert.equal(event?.type, 'chat');
  if (event?.type !== 'chat') return;
  assert.deepEqual(event.parts, [
    { kind: 'emote', name: 'HUSS', url: HUSS_URL },
    { kind: 'text', text: ' ' },
    { kind: 'emote', name: 'HUSS', url: HUSS_URL },
  ]);
});

test('a message without a channel ID still arrives, without third-party emotes', () => {
  const { chat, events } = setup();
  chat.receive('ohnepixel', 'HUSS', fakeMessage(null));
  const event = events[0];
  if (event?.type !== 'chat') return assert.fail('expected a chat event');
  assert.deepEqual(event.parts, [{ kind: 'text', text: 'HUSS' }]);
});

test("leaving a channel forgets that channel's emotes", async () => {
  const { chat, adapter, forgotten } = setup();
  chat.receive('ohnepixel', 'hi', fakeMessage('43683025'));
  await adapter.leave('ohnepixel');
  assert.deepEqual(forgotten, ['43683025']);
});
