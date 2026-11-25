import { ChatClient } from '@twurple/chat';
import type {
  ChatMessage as TwurpleChatMessage,
  ClearChat,
} from '@twurple/chat';
import type { ChatEvent } from '../../types.ts';
import type { PlatformAdapter } from '../adapter.ts';
import { enrichParts, type EmoteLookup } from '../../emotes/enrich.ts';
import { BurstDetector } from './burst.ts';
import { mapTwitch } from './map.ts';
import { toTwitchRaw } from './raw.ts';

/** If no viewer list has arrived by these times after joining, try a probe. */
const PROBE_AT_MS = [2 * 60_000, 7 * 60_000, 15 * 60_000];
/** How long a probe stays connected before giving up. */
const PROBE_LIFETIME_MS = 2 * 60_000;

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

/** A short-lived extra connection, joined to one channel, used only to catch the viewer list. */
export interface MembershipProbe {
  quit(): void;
  onJoin(handler: (channel: string, user: string) => void): unknown;
}

/** Where third-party emotes come from. EmoteCache already fits this shape. */
export interface EmoteSource {
  lookup(channelId: string): EmoteLookup;
  forget(channelId: string): void;
}

export interface TwitchAdapterOptions {
  isKnownBot: (name: string) => boolean;
  emotes?: EmoteSource;
  /** Opens a probe already joined to the channel. Leave out to disable retries. */
  openProbe?: (channel: string) => MembershipProbe;
}

const NO_EMOTES: EmoteSource = {
  lookup: () => new Map(),
  forget: () => undefined,
};

/** Per channel: whether the viewer list has arrived, pending checks, and any open probe. */
interface Watch {
  readonly detector: BurstDetector;
  readonly checks: NodeJS.Timeout[];
  probe: { client: MembershipProbe; expiry: NodeJS.Timeout } | null;
}

/** @param channel Twitch channel name, as Twurple reports it */
function onTwitch(channel: string) {
  return { platform: 'twitch', channel } as const;
}

export class TwitchAdapter implements PlatformAdapter {
  readonly platform = 'twitch';
  readonly #client: TwitchChatSource;
  readonly #isKnownBot: (name: string) => boolean;
  readonly #emotes: EmoteSource;
  readonly #openProbe: ((channel: string) => MembershipProbe) | undefined;
  readonly #handlers: ((event: ChatEvent) => void)[] = [];
  /** Channel name → Twitch user ID, learned from incoming messages. */
  readonly #channelIds = new Map<string, string>();
  readonly #watches = new Map<string, Watch>();

  constructor(client: TwitchChatSource, options: TwitchAdapterOptions) {
    this.#client = client;
    this.#isKnownBot = options.isKnownBot;
    this.#emotes = options.emotes ?? NO_EMOTES;
    this.#openProbe = options.openProbe;

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
      this.#safely(channel, () => this.#handleJoin(channel, user, 'main'));
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
    for (const channel of [...this.#watches.keys()]) this.#unwatch(channel);
    this.#client.quit();
  }

  async join(channel: string): Promise<void> {
    const name = channel.toLowerCase();
    this.#watch(name);
    try {
      await this.#client.join(name);
    } catch (err) {
      this.#unwatch(name);
      throw err;
    }
  }

  async leave(channel: string): Promise<void> {
    const name = channel.toLowerCase();
    this.#unwatch(name);
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

  /** A join from the main connection or a probe: pass it on, and note it for burst detection. */
  #handleJoin(channel: string, user: string, via: 'main' | 'probe'): void {
    this.#emit({
      type: 'join',
      ...onTwitch(channel),
      login: user,
      isBot: this.#isKnownBot(user),
    });
    const watch = this.#watches.get(channel);
    if (watch?.detector.record(Date.now())) {
      console.log(`[twitch] ${channel}: viewer list received (${via})`);
      this.#unwatch(channel);
    }
  }

  /** Start checking whether the viewer list arrives; schedule probes if it doesn't. */
  #watch(channel: string): void {
    if (!this.#openProbe || this.#watches.has(channel)) return;
    const checks = PROBE_AT_MS.map((ms) =>
      setTimeout(() => this.#probe(channel), ms).unref(),
    );
    this.#watches.set(channel, {
      detector: new BurstDetector(),
      checks,
      probe: null,
    });
  }

  #probe(channel: string): void {
    const watch = this.#watches.get(channel);
    if (!this.#openProbe || !watch || watch.detector.seen || watch.probe) return;

    console.log(`[twitch] ${channel}: no viewer list yet, opening a probe`);
    const client = this.#openProbe(channel);
    client.onJoin((joined, user) => {
      if (joined !== channel) return;
      this.#safely(channel, () => this.#handleJoin(channel, user, 'probe'));
    });
    const expiry = setTimeout(() => {
      console.log(`[twitch] ${channel}: probe timed out`);
      this.#closeProbe(watch);
    }, PROBE_LIFETIME_MS).unref();
    watch.probe = { client, expiry };
  }

  #closeProbe(watch: Watch): void {
    if (!watch.probe) return;
    clearTimeout(watch.probe.expiry);
    watch.probe.client.quit();
    watch.probe = null;
  }

  /** Stop checking a channel: cancel pending probes and close any open one. */
  #unwatch(channel: string): void {
    const watch = this.#watches.get(channel);
    if (!watch) return;
    for (const check of watch.checks) clearTimeout(check);
    if (watch.probe) console.log(`[twitch] ${channel}: probe closed`);
    this.#closeProbe(watch);
    this.#watches.delete(channel);
  }

  #emit(event: ChatEvent): void {
    for (const handler of this.#handlers) handler(event);
  }
}

export function createTwitchAdapter(
  options: Omit<TwitchAdapterOptions, 'openProbe'>,
): TwitchAdapter {
  return new TwitchAdapter(
    new ChatClient({
      rejoinChannelsOnReconnect: true,
      requestMembershipEvents: true,
    }),
    {
      ...options,
      openProbe: (channel) => {
        const probe = new ChatClient({
          channels: [channel],
          requestMembershipEvents: true,
        });
        probe.connect();
        return probe;
      },
    },
  );
}