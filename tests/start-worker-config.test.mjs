import assert from 'node:assert/strict';
import test from 'node:test';
import { BOOTSTRAP_USER_BINDING, bootstrapVariableArgs } from '../scripts/start-worker-config.mjs';

void test('starter omits the bootstrap binding when the environment variable is absent', () => {
  assert.deepEqual(bootstrapVariableArgs(undefined), []);
});

void test('starter forwards one normalized positive bootstrap binding', () => {
  assert.deepEqual(bootstrapVariableArgs(' 81234 '), ['--var', `${BOOTSTRAP_USER_BINDING}:81234`]);
});

void test('starter rejects empty, non-numeric, non-positive, and unsafe bootstrap IDs', () => {
  for (const value of ['', '   ', '12x', '-12', '0', '1.5', '9007199254740992']) {
    assert.throws(() => bootstrapVariableArgs(value), /inteiro positivo/);
  }
});
