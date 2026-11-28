export const KICK_SUBSCRIPTIONS_URL =
  'https://api.kick.com/public/v1/events/subscriptions';
export const CHAT_EVENT = 'chat.message.sent';
const TIMEOUT_MS = 5_000;

export interface KickSubscription {
  readonly id: string;
  readonly broadcasterId: string;
}

export interface KickSubscriptionsOptions {
  getToken: () => Promise<string>;
  fetchFn?: typeof fetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function dataArray(body: unknown): unknown[] {
  if (!isRecord(body) || !Array.isArray(body.data)) {
    throw new Error('Kick response has no data array');
  }
  return body.data;
}

/** Kick's Events API, limited to the chat-message webhooks this connector uses. */
export class KickSubscriptions {
  readonly #getToken: () => Promise<string>;
  readonly #fetch: typeof fetch;

  constructor(options: KickSubscriptionsOptions) {
    this.#getToken = options.getToken;
    this.#fetch = options.fetchFn ?? fetch;
  }

  /** Every chat-message subscription this app currently holds. */
  async list(): Promise<KickSubscription[]> {
    const body = await this.#request('GET', KICK_SUBSCRIPTIONS_URL);
    const subs: KickSubscription[] = [];
    for (const item of dataArray(body)) {
      if (!isRecord(item) || item.event !== CHAT_EVENT) continue;
      if (typeof item.id !== 'string') continue;
      if (!Number.isSafeInteger(item.broadcaster_user_id)) continue;
      subs.push({
        id: item.id,
        broadcasterId: String(item.broadcaster_user_id),
      });
    }
    return subs;
  }

  /** Subscribes to one broadcaster's chat and returns the subscription ID. */
  async create(broadcasterId: string): Promise<string> {
    const body = await this.#request('POST', KICK_SUBSCRIPTIONS_URL, {
      broadcaster_user_id: Number(broadcasterId),
      events: [{ name: CHAT_EVENT, version: 1 }],
      method: 'webhook',
    });
    const first = dataArray(body)[0];
    const id = isRecord(first) ? first.subscription_id : undefined;
    if (typeof id !== 'string' || id === '') {
      const reason = isRecord(first) ? first.error : undefined;
      throw new Error(
        `Kick refused the subscription for ${broadcasterId}: ${
          typeof reason === 'string' ? reason : 'no subscription_id'
        }`,
      );
    }
    return id;
  }

  async remove(subscriptionId: string): Promise<void> {
    const url = new URL(KICK_SUBSCRIPTIONS_URL);
    url.searchParams.set('id', subscriptionId);
    await this.#request('DELETE', url.toString());
  }

  async #request(
    method: string,
    url: string,
    json?: unknown,
  ): Promise<unknown> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await this.#getToken()}`,
    };
    if (json !== undefined) headers['Content-Type'] = 'application/json';

    const response = await this.#fetch(url, {
      method,
      headers,
      body: json === undefined ? undefined : JSON.stringify(json),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(
        `Kick ${method} subscriptions failed: HTTP ${response.status}`,
      );
    }
    // DELETE answers 204 with no body
    return response.status === 204 ? null : response.json();
  }
}
