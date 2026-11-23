import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSettings } from '../../overlay/core/settings.js';

test('an empty URL gives the defaults', () => {
  const s = parseSettings('');
  assert.equal(s.twitch, null);
  assert.equal(s.maxMessages, 30);
  assert.equal(s.rosterMax, 80);
  assert.equal(s.roster, true);
  assert.equal(s.showBots, false);
  assert.equal(s.portraits, true);
  assert.equal(s.theme, null);
});

test('normalises the Twitch channel', () => {
  assert.equal(parseSettings('?channel=%23Limmy').twitch, 'limmy');
});

test('reads Kick and YouTube IDs, rejecting malformed ones', () => {
  const valid = parseSettings('?kick=12345&yt=UCabcdefghijklmnopqrstuv');
  assert.equal(valid.kick, 12345);
  assert.equal(valid.youtube, 'UCabcdefghijklmnopqrstuv');

  const invalid = parseSettings('?kick=abc&yt=not-a-channel');
  assert.equal(invalid.kick, null);
  assert.equal(invalid.youtube, null);
});

test('bad numbers fall back to defaults, including negatives', () => {
  assert.equal(parseSettings('?max=abc').maxMessages, 30);
  assert.equal(parseSettings('?max=-3').maxMessages, 30);
  assert.equal(parseSettings('?max=50').maxMessages, 50);
});

test('portrait=0 turns portraits off; a number sets their size', () => {
  const off = parseSettings('?portrait=0');
  assert.equal(off.portraits, false);
  assert.equal(off.portraitSize, null);

  const sized = parseSettings('?portrait=64');
  assert.equal(sized.portraits, true);
  assert.equal(sized.portraitSize, 64);
});

test('reads the hide list, normalising names', () => {
  assert.deepEqual(parseSettings('?hide=SomeBot,%20@Other,,').hiddenNames, [
    'somebot',
    'other',
  ]);
});

test('toggles: roster off, bots shown, preview and demo', () => {
  const s = parseSettings('?roster=0&bots=1&bg=1&demo=1');
  assert.equal(s.roster, false);
  assert.equal(s.showBots, true);
  assert.equal(s.previewBackground, true);
  assert.equal(s.demo, true);
});

test('opacity accepts 0 to 1 only', () => {
  assert.equal(parseSettings('?opacity=0').opacity, 0);
  assert.equal(parseSettings('?opacity=0.5').opacity, 0.5);
  assert.equal(parseSettings('?opacity=2').opacity, null);
});

test('accepts the four faction themes only', () => {
  assert.equal(parseSettings('?theme=amarr').theme, 'amarr');
  assert.equal(parseSettings('?theme=jove').theme, null);
});

test('keeps legacy fixed-size URLs working', () => {
  const s = parseSettings('?width=440&maxheight=480');
  assert.equal(s.legacyWidth, 440);
  assert.equal(s.legacyMaxHeight, 480);
});
