import type { MessagePart } from '../types.ts';

export type EmoteLookup = ReadonlyMap<string, string>;

function appendText(parts: MessagePart[], text: string): void {
  const last = parts.at(-1);
  if (last?.kind === 'text') {
    parts[parts.length - 1] = { kind: 'text', text: last.text + text };
  } else {
    parts.push({ kind: 'text', text });
  }
}

export function enrichParts(
  parts: readonly MessagePart[],
  emotes: EmoteLookup,
): MessagePart[] {
  if (emotes.size === 0) return [...parts];

  const result: MessagePart[] = [];
  for (const part of parts) {
    if (part.kind !== 'text') {
      result.push(part);
      continue;
    }

    for (const piece of part.text.split(/(\s+)/)) {
      if (piece === '') continue;
      const url = emotes.get(piece);
      if (url) {
        result.push({ kind: 'emote', name: piece, url });
      } else {
        appendText(result, piece);
      }
    }
  }
  return result;
}
