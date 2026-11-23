import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBotMatcher, isKnownBot } from '../src/bots.ts';

test('matches a known bot regardless of capitalisation', () => {
  const isBot = createBotMatcher(['nightbot']);
  assert.equal(isBot('Nightbot'), true);
  assert.equal(isBot('NIGHTBOT'), true);
});

test('does not match a regular viewer', () => {
  const isBot = createBotMatcher(['nightbot']);
  assert.equal(isBot('m1d3v1l'), false);
});

test('the default list recognises StreamElements as it appears in real chat', () => {
  assert.equal(isKnownBot('StreamElements'), true);
});
