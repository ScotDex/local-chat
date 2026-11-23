import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toSegments } from '../../overlay/core/text.js';

test('plain text stays a single segment', () => {
  assert.deepEqual(toSegments([{ kind: 'text', text: 'o7 pilots' }]), [
    { kind: 'text', text: 'o7 pilots' },
  ]);
});

test('finds a link inside text', () => {
  assert.deepEqual(
    toSegments([{ kind: 'text', text: 'check https://zkillboard.com now' }]),
    [
      { kind: 'text', text: 'check ' },
      { kind: 'link', text: 'https://zkillboard.com' },
      { kind: 'text', text: ' now' },
    ],
  );
});

test('leaves trailing punctuation out of the link', () => {
  assert.deepEqual(
    toSegments([{ kind: 'text', text: 'see www.socketkill.com.' }]),
    [
      { kind: 'text', text: 'see ' },
      { kind: 'link', text: 'www.socketkill.com' },
      { kind: 'text', text: '.' },
    ],
  );
});

test('real message: a bot announcement with a link at the end', () => {
  const segments = toSegments([
    {
      kind: 'text',
      text: ' JOIN OUR COMMUNITY ON REDDIT: https://www.reddit.com/r/ohnePixel',
    },
  ]);
  assert.deepEqual(segments.at(-1), {
    kind: 'link',
    text: 'https://www.reddit.com/r/ohnePixel',
  });
});

test('emotes pass through between text segments', () => {
  const emote = {
    kind: 'emote',
    name: 'BANGER',
    url: 'https://cdn.7tv.app/emote/x/2x.webp',
  } as const;
  assert.deepEqual(
    toSegments([
      { kind: 'text', text: 'that is ' },
      emote,
      { kind: 'text', text: ' fr' },
    ]),
    [{ kind: 'text', text: 'that is ' }, emote, { kind: 'text', text: ' fr' }],
  );
});
