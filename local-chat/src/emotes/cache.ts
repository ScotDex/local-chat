import type { EmoteLookup } from './enrich.ts';
import {
  parseBttvChannel,
  parseBttvGlobal,
  parse7tvSet,
  parse7tvUser,
  parseFfz,
} from './providers.ts';

const DEFAULT_TTL_MS = 10 * 60_000;
const REQUEST_TIMEOUT_MS = 5_000;

export interface EmoteCacheOptions {
  fetchFn?: typeof fetch;
  now?: () => number;
  ttlMs?: number;
  warn?: (message: string) => void;
}

interface Entry {
  lookup: EmoteLookup;
  fetchedAt: number;
}

export class EmoteCache {
  readonly #fetch: typeof fetch;
  readonly #now: () => number;
  readonly #ttlMs: number;
  readonly #warn: (message: string) => void;
  readonly #channels = new Map<string, Entry>();
  readonly #inFlight = new Map<string, Promise<void>>();
  #globals: Entry | null = null;

  constructor(options: EmoteCacheOptions = {}) {
    this.#fetch = options.fetchFn ?? fetch;
    this.#now = options.now ?? Date.now;
    this.#ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.#warn = options.warn ?? ((message) => console.warn(message));
  }

  lookup(channelId: string): EmoteLookup {
    const entry = this.#channels.get(channelId);
    if (!entry || this.#isStale(entry)) {
      void this.refresh(channelId);
    }
    return entry?.lookup ?? new Map();
  }

  refresh(channelId: string): Promise<void> {
    const existing = this.#inFlight.get(channelId);
    if (existing) return existing;
    const job = this.#loadChannel(channelId).finally(() => {
      this.#inFlight.delete(channelId);
    });
    this.#inFlight.set(channelId, job);
    return job;
  }

  forget(channelId: string): void {
    this.#channels.delete(channelId);
  }

  #isStale(entry: Entry): boolean {
    return this.#now() - entry.fetchedAt >= this.#ttlMs;
  }

  async #loadGlobals(): Promise<EmoteLookup> {
    if (this.#globals && !this.#isStale(this.#globals))
      return this.#globals.lookup;
    const [bttv, sevenTv] = await Promise.all([
      this.#getJson('https://api.betterttv.net/3/cached/emotes/global').then(
        parseBttvGlobal,
      ),
      this.#getJson('https://7tv.io/v3/emote-sets/global').then(parse7tvSet),
    ]);
    const lookup = new Map([...bttv, ...sevenTv]);
    this.#globals = { lookup, fetchedAt: this.#now() };
    return lookup;
  }

  async #loadChannel(channelId: string): Promise<void> {
    const id = encodeURIComponent(channelId);
    const [globals, ffz, bttv, sevenTv] = await Promise.all([
      this.#loadGlobals(),
      this.#getJson(
        `https://api.betterttv.net/3/cached/frankerfacez/users/twitch/${id}`,
      ).then(parseFfz),
      this.#getJson(
        `https://api.betterttv.net/3/cached/users/twitch/${id}`,
      ).then(parseBttvChannel),
      this.#getJson(`https://7tv.io/v3/users/twitch/${id}`).then(parse7tvUser),
    ]);
    const lookup = new Map([...globals, ...ffz, ...bttv, ...sevenTv]);
    this.#channels.set(channelId, { lookup, fetchedAt: this.#now() });
  }

  async #getJson(url: string): Promise<unknown> {
    try {
      const res = await this.#fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) {
        this.#warn(`[emotes] ${url} returned HTTP ${res.status}`);
        return undefined;
      }
      return await res.json();
    } catch (err) {
      this.#warn(`[emotes] ${url} failed: ${String(err)}`);
      return undefined;
    }
  }
}
