import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enrichParts } from '../../src/emotes/enrich.ts';
import type { MessagePart } from '../../src/types.ts';

const D_URL = 'https://cdn.betterttv.net/emote/d/2x';
const KEKW_URL = 'https://cdn.betterttv.net/emote/kekw/2x';
const emotes = new Map([
  ['D:', D_URL],
  ['KEKW', KEKW_URL],
]);

const text = (t: string): MessagePart => ({ kind: 'text', text: t });

test('real message: a third-party emote at the start', () => {
  assert.deepEqual(enrichParts([text('D: get back in the car')], emotes), [
    { kind: 'emote', name: 'D:', url: D_URL },
    text(' get back in the car'),
  ]);
});

test('a message with no matches comes out unchanged', () => {
  assert.deepEqual(enrichParts([text('hello world')], emotes), [
    text('hello world'),
  ]);
});

test('keeps exact spacing around emotes', () => {
  assert.deepEqual(enrichParts([text('a  KEKW  b')], emotes), [
    text('a  '),
    { kind: 'emote', name: 'KEKW', url: KEKW_URL },
    text('  b'),
  ]);
});

test('matching is case-sensitive and whole-word only', () => {
  assert.deepEqual(enrichParts([text('kekw KEKWait')], emotes), [
    text('kekw KEKWait'),
  ]);
});

test('leaves Twitch emote parts untouched', () => {
  const lul: MessagePart = {
    kind: 'emote',
    name: 'LUL',
    url: 'https://twitch/lul',
  };
  assert.deepEqual(enrichParts([lul, text(' KEKW')], emotes), [
    lul,
    text(' '),
    { kind: 'emote', name: 'KEKW', url: KEKW_URL },
  ]);
});

test('with no emotes loaded, parts pass through unchanged', () => {
  const parts = [text('D: KEKW')];
  assert.deepEqual(enrichParts(parts, new Map()), parts);
});
