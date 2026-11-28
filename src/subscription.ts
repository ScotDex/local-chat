import type { Platform } from './types.ts';

export interface Subscription {
  readonly platform: Platform;
  readonly channel: string;
}

export type SubscriptionResult =
  | { readonly ok: true; readonly value: Subscription }
  | { readonly ok: false; readonly error: string };

const TWITCH_CHANNEL = /^[a-z0-9_]{1,25}$/;
const KICK_BROADCASTER_ID = /^[1-9][0-9]{0,15}$/;

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
        case 'kick': {
      const id = channel.trim();
      if (!KICK_BROADCASTER_ID.test(id) || !Number.isSafeInteger(Number(id)))
        return fail('Invalid Kick channel ID');
      return { ok: true, value: { platform: 'kick', channel: id } };
    }
    case 'youtube':
      return fail(`${platform} is not supported yet`);
    default:
      return fail('Unknown platform');
  }
}
