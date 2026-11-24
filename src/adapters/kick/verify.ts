import { verify as cryptoVerify, type KeyObject } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';

export const TOLERANCE_MS = 5 * 60_000;

export type VerifyResult =
  'ok' | 'no-key' | 'missing-headers' | 'stale' | 'duplicate' | 'bad-signature';

export interface KickVerifierOptions {
  now?: () => number;
}

function header(headers: IncomingHttpHeaders, name: string): string | null {
  const value = headers[name];
  return typeof value === 'string' && value !== '' ? value : null;
}

function isValidSignature(
  signed: Buffer,
  key: KeyObject,
  signature: string,
): boolean {
  try {
    return cryptoVerify(
      'sha256',
      signed,
      key,
      Buffer.from(signature, 'base64'),
    );
  } catch {
    return false;
  }
}

export class KickVerifier {
  readonly #now: () => number;
  /** Message ID → when it can be forgotten. */
  readonly #seen = new Map<string, number>();

  constructor(options: KickVerifierOptions = {}) {
    this.#now = options.now ?? Date.now;
  }

  verify(
    key: KeyObject | null,
    headers: IncomingHttpHeaders,
    rawBody: Buffer,
  ): VerifyResult {
    if (!key) return 'no-key';

    const id = header(headers, 'kick-event-message-id');
    const timestamp = header(headers, 'kick-event-message-timestamp');
    const signature = header(headers, 'kick-event-signature');
    if (!id || !timestamp || !signature) return 'missing-headers';

    const now = this.#now();
    const sentAt = Date.parse(timestamp);
    if (Number.isNaN(sentAt) || Math.abs(now - sentAt) > TOLERANCE_MS) {
      return 'stale';
    }

    this.#forgetExpired(now);
    if (this.#seen.has(id)) return 'duplicate';

    const signed = Buffer.concat([Buffer.from(`${id}.${timestamp}.`), rawBody]);
    if (!isValidSignature(signed, key, signature)) return 'bad-signature';

    this.#seen.set(id, now + TOLERANCE_MS);
    return 'ok';
  }

  #forgetExpired(now: number): void {
    for (const [id, expiry] of this.#seen) {
      if (expiry > now) break;
      this.#seen.delete(id);
    }
  }
}
