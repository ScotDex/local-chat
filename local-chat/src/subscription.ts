import type { Platform } from './types.ts';

export interface Subscription {
  readonly platform: Platform;
  readonly channel: string;
}

export type SubscriptionResult =
  | { readonly ok: true; readonly value: Subscription }
  | { readonly ok: false; readonly error: string };

const TWITCH_CHANNEL = /^[a-z0-9_]{1,25}$/;

function fail(error: string): SubscriptionResult {
  return { ok: false, error };
}

export function parseSubscription(input: unknown): SubscriptionResult {
  if (typeof input !== 'object' || input === null) {
    return fail('Expected { platform, channel }');
  }
  const { platform, channel } = input as Record<string, unknown>;
  if (typeof channel !== 'string') {
    return fail('channel must be a string');
  }

  switch (platform) {
    case 'twitch': {
      const name = channel.trim().toLowerCase();
      if (!TWITCH_CHANNEL.test(name))
        return fail('Invalid Twitch channel name');
      return { ok: true, value: { platform: 'twitch', channel: name } };
    }
    case 'kick':
    case 'youtube':
      return fail(`${platform} is not supported yet`);
    default:
      return fail('Unknown platform');
  }
}
