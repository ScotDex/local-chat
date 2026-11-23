import type { ChatMessage as TwurpleChatMessage } from '@twurple/chat';
import type { TwitchEmote, TwitchRawMessage } from './map.ts';

export function parseEmoteOffsets(
  offsets: ReadonlyMap<string, readonly string[]>,
): TwitchEmote[] {
  const emotes: TwitchEmote[] = [];
  for (const [id, ranges] of offsets) {
    for (const range of ranges) {
      const [start, end] = range.split('-').map(Number);
      if (start === undefined || end === undefined) continue;
      if (!Number.isInteger(start) || !Number.isInteger(end)) continue;
      emotes.push({ id, start, end });
    }
  }
  return emotes;
}

export function toTwitchRaw(
  channel: string,
  text: string,
  msg: TwurpleChatMessage,
): TwitchRawMessage {
  const user = msg.userInfo;
  return {
    id: msg.id,
    channel,
    userId: user.userId,
    login: user.userName, // ← new
    displayName: user.displayName,
    color: user.color || null,
    isBroadcaster: user.isBroadcaster,
    isMod: user.isMod,
    isVip: user.isVip,
    isSubscriber: user.isSubscriber,
    text,
    emotes: parseEmoteOffsets(msg.emoteOffsets),
    timestamp: msg.date.getTime(),
  };
}
