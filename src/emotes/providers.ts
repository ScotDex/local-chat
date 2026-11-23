import type { EmoteLookup } from './enrich.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function bttvEntries(list: unknown): [string, string][] {
  const entries: [string, string][] = [];
  for (const item of asArray(list)) {
    if (!isRecord(item)) continue;
    const { id, code } = item;
    if (typeof id !== 'string' || typeof code !== 'string') continue;
    entries.push([code, `https://cdn.betterttv.net/emote/${id}/2x`]);
  }
  return entries;
}

export function parseBttvGlobal(body: unknown): EmoteLookup {
  return new Map(bttvEntries(body));
}

export function parseBttvChannel(body: unknown): EmoteLookup {
  if (!isRecord(body)) return new Map();
  return new Map([
    ...bttvEntries(body.channelEmotes),
    ...bttvEntries(body.sharedEmotes),
  ]);
}

export function parseFfz(body: unknown): EmoteLookup {
  const lookup = new Map<string, string>();
  for (const item of asArray(body)) {
    if (!isRecord(item)) continue;
    const { code, images } = item;
    if (typeof code !== 'string' || !isRecord(images)) continue;
    const url = images['2x'] ?? images['1x'];
    if (typeof url === 'string') lookup.set(code, url);
  }
  return lookup;
}

export function parse7tvSet(set: unknown): EmoteLookup {
  const lookup = new Map<string, string>();
  if (!isRecord(set)) return lookup;
  for (const item of asArray(set.emotes)) {
    if (!isRecord(item)) continue;
    const { name, data } = item;
    if (typeof name !== 'string' || !isRecord(data)) continue;
    const { host } = data;
    if (!isRecord(host)) continue;
    const hostUrl = host.url;
    if (typeof hostUrl !== 'string') continue;
    const base = hostUrl.startsWith('//') ? `https:${hostUrl}` : hostUrl;
    lookup.set(name, `${base}/2x.webp`);
  }
  return lookup;
}

export function parse7tvUser(body: unknown): EmoteLookup {
  return isRecord(body) ? parse7tvSet(body.emote_set) : new Map();
}
