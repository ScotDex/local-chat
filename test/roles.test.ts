import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortRoles } from '../src/roles.ts';

test('puts the highest role first', () => {
  assert.deepEqual(sortRoles(['sub', 'mod']), ['mod', 'sub']);
});

test('orders the full set by precedence', () => {
  assert.deepEqual(sortRoles(['sub', 'vip', 'broadcaster', 'mod']), [
    'broadcaster',
    'mod',
    'vip',
    'sub',
  ]);
});

test('removes duplicates', () => {
  assert.deepEqual(sortRoles(['mod', 'mod', 'sub']), ['mod', 'sub']);
});

test('returns an empty list for a regular viewer', () => {
  assert.deepEqual(sortRoles([]), []);
});
