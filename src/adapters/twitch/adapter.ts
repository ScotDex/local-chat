import { ChatClient } from '@twurple/chat';
import type {
  ChatMessage as TwurpleChatMessage,
  ClearChat,
} from '@twurple/chat';
import type { ChatEvent } from '../../types.ts';
import type { PlatformAdapter } from '../adapter.ts';
import { enrichParts, type EmoteLookup } from '../../emotes/enrich.ts';
import { mapTwitch } from './map.ts';
import { toTwitchRaw } from './raw.ts';

export interface TwitchChatSource {
  connect(): void;
  quit(): void;
  join(channel: string): Promise<void>;
  part(channel: string): void;
  onMessage(
    handler: (
      channel: string,
      user: string,
      text: string,
      msg: TwurpleChatMessage,
    ) => void,
  ): unknown;
  onMessageRemove(
    handler: (channel: string, messageId: string) => void,
  ): unknown;
  onBan(
    handler: (channel: string, user: string, msg: ClearChat) => void,
  ): unknown;
  onTimeout(
    handler: (
      channel: string,
      user: string,
      duration: number,
      msg: ClearChat,
    ) => void,
  ): unknown;
  onChatClear(handler: (channel: string) => void): unknown;
  onJoin(handler: (channel: string, user: string) => void): unknown;
  onPart(handler: (channel: string, user: string) => void): unknown;
}

/** Where third-party emotes come from. EmoteCache already fits this shape. */
export interface EmoteSource {
  lookup(channelId: string): EmoteLookup;
  forget(channelId: string): void;
}

export interface TwitchAdapterOptions {
  isKnownBot: (name: string) => boolean;
  emotes?: EmoteSource;
}

const NO_EMOTES: EmoteSource = {
  lookup: () => new Map(),
  forget: () => undefined,
};

/** @param channel Twitch channel name, as Twurple reports it */
function onTwitch(channel: string) {
  return { platform: 'twitch', channel } as const;
}

export class TwitchAdapter implements PlatformAdapter {
  readonly platform = 'twitch';
  readonly #client: TwitchChatSource;
  readonly #isKnownBot: (name: string) => boolean;
  readonly #emotes: EmoteSource;
  readonly #handlers: ((event: ChatEvent) => void)[] = [];
  /** Channel name → Twitch user ID, learned from incoming messages. */
  readonly #channelIds = new Map<string, string>();

  constructor(client: TwitchChatSource, options: TwitchAdapterOptions) {
    this.#client = client;
    this.#isKnownBot = options.isKnownBot;
    this.#emotes = options.emotes ?? NO_EMOTES;

    client.onMessage((channel, _user, text, msg) => {
      this.#safely(channel, () => this.#handleMessage(channel, text, msg));
    });
    client.onMessageRemove((channel, messageId) => {
      this.#safely(channel, () =>
        this.#emit({ type: 'delete', ...onTwitch(channel), messageId }),
      );
    });
    client.onBan((channel, user, msg) => {
      this.#safely(channel, () =>
        this.#emit({
          type: 'ban',
          ...onTwitch(channel),
          userId: msg.targetUserId ?? '',
          login: user,
          durationSeconds: null,
        }),
      );
    });
    client.onTimeout((channel, user, duration, msg) => {
      this.#safely(channel, () =>
        this.#emit({
          type: 'ban',
          ...onTwitch(channel),
          userId: msg.targetUserId ?? '',
          login: user,
          durationSeconds: duration,
        }),
      );
    });
    client.onChatClear((channel) => {
      this.#safely(channel, () =>
        this.#emit({ type: 'clear', ...onTwitch(channel) }),
      );
    });
    client.onJoin((channel, user) => {
      this.#safely(channel, () =>
        this.#emit({
          type: 'join',
          ...onTwitch(channel),
          login: user,
          isBot: this.#isKnownBot(user),
        }),
      );
    });
    client.onPart((channel, user) => {
      this.#safely(channel, () =>
        this.#emit({ type: 'part', ...onTwitch(channel), login: user }),
      );
    });
  }

  async start(): Promise<void> {
    this.#client.connect();
  }

  async stop(): Promise<void> {
    this.#client.quit();
  }

  async join(channel: string): Promise<void> {
    console.log(`[debug] joining ${channel}`);
    await this.#client.join(channel.toLowerCase());
    console.log(`[debug] joined ${channel}`);
  }

  async leave(channel: string): Promise<void> {
    const name = channel.toLowerCase();
    this.#client.part(name);
    const channelId = this.#channelIds.get(name);
    if (channelId) {
      this.#emotes.forget(channelId);
      this.#channelIds.delete(name);
    }
  }

  onEvent(handler: (event: ChatEvent) => void): void {
    this.#handlers.push(handler);
  }

  /** One bad event is logged and skipped; it never stops the others. */
  #safely(channel: string, work: () => void): void {
    try {
      work();
    } catch (err) {
      console.error(`[twitch] failed to handle an event in ${channel}`, err);
    }
  }

  #handleMessage(channel: string, text: string, msg: TwurpleChatMessage): void {
    const event = mapTwitch(toTwitchRaw(channel, text, msg), this.#isKnownBot);
    const channelId = msg.channelId;
    if (!channelId) {
      this.#emit(event);
      return;
    }
    this.#channelIds.set(channel, channelId);
    this.#emit({
      ...event,
      parts: enrichParts(event.parts, this.#emotes.lookup(channelId)),
    });
  }

  #emit(event: ChatEvent): void {
    for (const handler of this.#handlers) handler(event);
  }
}

export function createTwitchAdapter(
  options: TwitchAdapterOptions,
): TwitchAdapter {
  const client = new ChatClient({
    rejoinChannelsOnReconnect: true,
    requestMembershipEvents: true,
  });
  let rawJoins = 0;
  client.irc.onAnyMessage((msg) => {
    if (msg.command !== 'JOIN') return;
    rawJoins++;
    if (rawJoins % 25 === 0)
      console.log(`[debug] raw JOINs so far: ${rawJoins}`);
  });
  client.onConnect(() => console.log('[debug] irc connected'));
  return new TwitchAdapter(client, options);
}
