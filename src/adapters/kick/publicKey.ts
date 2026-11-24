import { createPublicKey, type KeyObject } from 'node:crypto';

export const KICK_PUBLIC_KEY_URL = 'https://api.kick.com/public/v1/public-key';
/** After a failed load, wait this long before trying again. */
export const RETRY_AFTER_MS = 60_000;
const TIMEOUT_MS = 5_000;

export interface KickPublicKeyOptions {
  fetchFn?: typeof fetch;
  now?: () => number;
  warn?: (message: string) => void;
}

/** Reads `data.public_key` from Kick's response, or null if it isn't there. */
function parsePem(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const data = (body as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null) return null;
  const pem = (data as { public_key?: unknown }).public_key;
  return typeof pem === 'string' && pem !== '' ? pem : null;
}

/** Kick's webhook signing key: loaded on demand, kept once loaded. */
export class KickPublicKey {
  readonly #fetch: typeof fetch;
  readonly #now: () => number;
  readonly #warn: (message: string) => void;
  #key: KeyObject | null = null;
  #inFlight: Promise<KeyObject | null> | null = null;
  #lastAttempt = Number.NEGATIVE_INFINITY;

  constructor(options: KickPublicKeyOptions = {}) {
    this.#fetch = options.fetchFn ?? fetch;
    this.#now = options.now ?? Date.now;
    this.#warn = options.warn ?? ((message) => console.warn(message));
  }

  /** The key, loading it if needed. Never throws: null means "not available yet". */
  async get(): Promise<KeyObject | null> {
    if (this.#key) return this.#key;
    if (this.#inFlight) return this.#inFlight;
    if (this.#now() - this.#lastAttempt < RETRY_AFTER_MS) return null;

    this.#lastAttempt = this.#now();
    this.#inFlight = this.#load().finally(() => {
      this.#inFlight = null;
    });
    return this.#inFlight;
  }

  async #load(): Promise<KeyObject | null> {
    try {
      const response = await this.#fetch(KICK_PUBLIC_KEY_URL, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const pem = parsePem(await response.json());
      if (!pem) throw new Error('response has no public_key');
      this.#key = createPublicKey(pem);
      return this.#key;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.#warn(`[kick] could not load the webhook public key: ${reason}`);
      return null;
    }
  }
}
