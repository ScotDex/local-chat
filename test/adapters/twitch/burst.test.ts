import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BurstDetector } from '../../../src/adapters/twitch/burst.ts';

const small = () => new BurstDetector({ min: 3, windowMs: 1_000 });

test('a few joins are not a burst', () => {
  const detector = small();
  assert.equal(detector.record(0), false);
  assert.equal(detector.record(10), false);
  assert.equal(detector.seen, false);
});

test('enough joins together are a burst, reported once', () => {
  const detector = small();
  detector.record(0);
  detector.record(10);
  assert.equal(detector.record(20), true);
  assert.equal(detector.seen, true);
  assert.equal(detector.record(30), false);
});

test('joins spread out over time do not add up to a burst', () => {
  const detector = small();
  detector.record(0);
  detector.record(2_000);
  detector.record(4_000);
  detector.record(6_000);
  assert.equal(detector.seen, false);
});

test('only joins inside the window count', () => {
  const detector = small();
  detector.record(0);
  detector.record(1_500); // the first has dropped out by now
  assert.equal(detector.record(1_600), false);
  assert.equal(detector.record(1_700), true);
});
