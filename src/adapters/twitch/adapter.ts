import { ChatClient } from '@twurple/chat';
import type { ChatMessage as TwurpleChatMessage } from '@twurple/chat';
import type { ChatEvent } from '../../types.ts';
import type { PlatformAdapter } from '../adapter.ts';
import { enrichParts, type EmoteLookup } from '../../emotes/enrich.ts';
import { mapTwitch } from './map.ts';
import { toTwitchRaw } from './raw.ts';

/** The parts of Twurple's ChatClient this adapter uses, so tests can supply a fake. */
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
    this.#client.onMessage((channel, _user, text, msg) => {
      try {
        this.#handleMessage(channel, text, msg);
      } catch (err) {
        console.error(`[twitch] failed to handle a message in ${channel}`, err);
      }
    });
  }

  async start(): Promise<void> {
    this.#client.connect();
  }

  async stop(): Promise<void> {
    this.#client.quit();
  }

  async join(channel: string): Promise<void> {
    await this.#client.join(channel.toLowerCase());
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
  return new TwitchAdapter(
    new ChatClient({ rejoinChannelsOnReconnect: true }),
    options,
  );
}
