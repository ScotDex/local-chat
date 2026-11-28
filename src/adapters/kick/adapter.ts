import type { IncomingHttpHeaders } from 'node:http';
import type { KeyObject } from 'node:crypto';
import type { ChatEvent } from '../../types.ts';
import type { PlatformAdapter } from '../adapter.ts';
import { mapKickChat } from './map.ts';
import { KickPublicKey } from './publicKey.ts';
import { CHAT_EVENT, KickSubscriptions } from './subscriptions.ts';
import { createKickTokenProvider } from './token.ts';
import { KickVerifier } from './verify.ts';

/** The parts of the subscriptions API the adapter uses. */
export interface SubscriptionStore {
  list(): Promise<{ id: string; broadcasterId: string }[]>;
  create(broadcasterId: string): Promise<string>;
  remove(subscriptionId: string): Promise<void>;
}

export interface WebhookVerifier {
  verify(
    key: KeyObject | null,
    headers: IncomingHttpHeaders,
    rawBody: Buffer,
  ): string;
}

export interface KickAdapterOptions {
  subscriptions: SubscriptionStore;
  publicKey: { get(): Promise<KeyObject | null> };
  verifier: WebhookVerifier;
  isKnownBot: (login: string) => boolean;
  now?: () => number;
}

function header(headers: IncomingHttpHeaders, name: string): string | null {
  const value = headers[name];
  return typeof value === 'string' ? value : null;
}

/**
 * Kick pushes chat to us as signed webhooks. Joining a channel means asking
 * Kick for a webhook subscription; leaving means deleting it.
 *
 * The Kick app must be used by this connector alone: start() deletes every
 * chat subscription the app holds, since none of them can have a watcher yet.
 */
export class KickAdapter implements PlatformAdapter {
  readonly platform = 'kick';
  readonly #subs: SubscriptionStore;
  readonly #publicKey: { get(): Promise<KeyObject | null> };
  readonly #verifier: WebhookVerifier;
  readonly #isKnownBot: (login: string) => boolean;
  readonly #now: () => number;
  readonly #handlers: ((event: ChatEvent) => void)[] = [];
  /** Broadcaster ID → subscription ID, for channels we have joined. */
  readonly #joined = new Map<string, string>();

  constructor(options: KickAdapterOptions) {
    this.#subs = options.subscriptions;
    this.#publicKey = options.publicKey;
    this.#verifier = options.verifier;
    this.#isKnownBot = options.isKnownBot;
    this.#now = options.now ?? Date.now;
  }

  async start(): Promise<void> {
    void this.#publicKey.get(); // warm the key so the first webhook isn't rejected
    try {
      const leftovers = await this.#subs.list();
      for (const sub of leftovers) await this.#removeQuietly(sub.id);
      if (leftovers.length > 0) {
        console.log(
          `[kick] removed ${leftovers.length} leftover subscriptions`,
        );
      }
    } catch (err) {
      // Leftovers only waste Kick's quota; overlays can still subscribe
      console.warn('[kick] could not clear leftover subscriptions', err);
    }
  }

  async stop(): Promise<void> {
    // Leave subscriptions in place: start() clears them on the next boot
    this.#joined.clear();
  }

  async join(channel: string): Promise<void> {
    if (this.#joined.has(channel)) return;
    const subscriptionId = await this.#subs.create(channel);
    this.#joined.set(channel, subscriptionId);
    console.log(`[kick] subscribed to ${channel}`);
  }

  async leave(channel: string): Promise<void> {
    const subscriptionId = this.#joined.get(channel);
    if (!subscriptionId) return;
    this.#joined.delete(channel);
    await this.#subs.remove(subscriptionId);
    console.log(`[kick] unsubscribed from ${channel}`);
  }

  onEvent(handler: (event: ChatEvent) => void): void {
    this.#handlers.push(handler);
  }

  /** Handles one webhook delivery. Never throws: bad deliveries are logged and dropped. */
  async handleWebhook(
    headers: IncomingHttpHeaders,
    rawBody: Buffer,
  ): Promise<void> {
    try {
      const key = await this.#publicKey.get();
      const result = this.#verifier.verify(key, headers, rawBody);
      if (result !== 'ok') {
        console.warn(`[kick] webhook rejected: ${result}`);
        return;
      }
      if (header(headers, 'kick-event-type') !== CHAT_EVENT) return;

      const message = mapKickChat(
        JSON.parse(rawBody.toString('utf8')),
        this.#isKnownBot,
        this.#now(),
      );
      // Ignore chat for channels we've left; Kick can deliver a few late ones
      if (!message || !this.#joined.has(message.channel)) return;
      for (const handler of this.#handlers) handler(message);
    } catch (err) {
      console.error('[kick] failed to handle a webhook', err);
    }
  }

  async #removeQuietly(subscriptionId: string): Promise<void> {
    try {
      await this.#subs.remove(subscriptionId);
    } catch (err) {
      console.warn(
        `[kick] could not remove subscription ${subscriptionId}`,
        err,
      );
    }
  }
}

export interface KickCredentials {
  clientId: string;
  clientSecret: string;
}

export function createKickAdapter(
  credentials: KickCredentials,
  isKnownBot: (login: string) => boolean,
): KickAdapter {
  const getToken = createKickTokenProvider(credentials);
  return new KickAdapter({
    subscriptions: new KickSubscriptions({ getToken }),
    publicKey: new KickPublicKey(),
    verifier: new KickVerifier(),
    isKnownBot,
  });
}
