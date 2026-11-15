import test from 'node:test';
import assert from 'node:assert/strict';
import { greet } from '../src/greet.mjs';

test('greets a name', () => {
  assert.match(greet('Ada'), /^Hello, Ada/);
});

test('keeps a name with a space intact', () => {
  assert.match(greet('Ada Lovelace'), /^Hello, Ada Lovelace/);
});
