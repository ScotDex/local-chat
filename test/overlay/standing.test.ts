import { test } from 'node:test';
import assert from 'node:assert/strict';
import { standingColour } from '../../overlay/skins/eve/render.js';

test('the broadcaster and mods are green', () => {
  assert.equal(standingColour(['broadcaster']), '#59c97a');
  assert.equal(standingColour(['mod', 'sub']), '#59c97a');
});

test('VIPs are red and subscribers purple', () => {
  assert.equal(standingColour(['vip', 'sub']), '#e04e4e');
  assert.equal(standingColour(['sub']), '#a970ff');
});

test('everyone else is grey', () => {
  assert.equal(standingColour([]), '#4a5358');
});
