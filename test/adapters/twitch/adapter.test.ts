import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  ChatMessage as TwurpleChatMessage,
  ClearChat,
} from '@twurple/chat';
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
  // `never[]` lets one map hold handlers with different parameter lists
  readonly #handlers = new Map<string, (...args: never[]) => void>();

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
    this.#handlers.set('message', handler);
  }
  onMessageRemove(handler: (channel: string, messageId: string) => void): void {
    this.#handlers.set('remove', handler);
  }
  onBan(
    handler: (channel: string, user: string, msg: ClearChat) => void,
  ): void {
    this.#handlers.set('ban', handler);
  }
  onTimeout(
    handler: (
      channel: string,
      user: string,
      duration: number,
      msg: ClearChat,
    ) => void,
  ): void {
    this.#handlers.set('timeout', handler);
  }
  onChatClear(handler: (channel: string) => void): void {
    this.#handlers.set('clear', handler);
  }
  onJoin(handler: (channel: string, user: string) => void): void {
    this.#handlers.set('join', handler);
  }
  onPart(handler: (channel: string, user: string) => void): void {
    this.#handlers.set('part', handler);
  }

  /** Test-only: simulate Twitch firing an event. */
  fire(event: string, ...args: unknown[]): void {
    const handler = this.#handlers.get(event) as
      ((...args: unknown[]) => void) | undefined;
    handler?.(...args);
  }
  receive(channel: string, text: string, msg: TwurpleChatMessage): void {
    this.fire('message', channel, 'user', text, msg);
  }
}

const clearChat = { targetUserId: 'id-troll' } as unknown as ClearChat;

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

test('a removed message becomes a delete event', () => {
  const { chat, events } = setup();
  chat.fire('remove', 'limmy', 'msg-1');
  assert.deepEqual(events, [
    {
      type: 'delete',
      platform: 'twitch',
      channel: 'limmy',
      messageId: 'msg-1',
    },
  ]);
});

test('a ban is permanent; a timeout carries its duration', () => {
  const { chat, events } = setup();
  chat.fire('ban', 'limmy', 'troll', clearChat);
  chat.fire('timeout', 'limmy', 'spammer', 600, clearChat);
  assert.equal(events[0]?.type === 'ban' && events[0].durationSeconds, null);
  assert.equal(events[1]?.type === 'ban' && events[1].durationSeconds, 600);
});

test('a chat clear becomes a clear event', () => {
  const { chat, events } = setup();
  chat.fire('clear', 'limmy');
  assert.deepEqual(events, [
    { type: 'clear', platform: 'twitch', channel: 'limmy' },
  ]);
});

test('joins and parts become membership events, with bots flagged', () => {
  const chat = new FakeChat();
  const adapter = new TwitchAdapter(chat, {
    isKnownBot: (login) => login === 'streamelements',
  });
  const events: ChatEvent[] = [];
  adapter.onEvent((event) => events.push(event));

  chat.fire('join', 'limmy', 'pilot');
  chat.fire('join', 'limmy', 'streamelements');
  chat.fire('part', 'limmy', 'pilot');

  assert.deepEqual(events, [
    {
      type: 'join',
      platform: 'twitch',
      channel: 'limmy',
      login: 'pilot',
      isBot: false,
    },
    {
      type: 'join',
      platform: 'twitch',
      channel: 'limmy',
      login: 'streamelements',
      isBot: true,
    },
    { type: 'part', platform: 'twitch', channel: 'limmy', login: 'pilot' },
  ]);
});
