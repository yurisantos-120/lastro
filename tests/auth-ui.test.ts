import assert from 'node:assert/strict';
import test from 'node:test';
import { canOperateTickets, canTestGlpi, canWriteData, roleLabel } from '../lib/auth-ui.ts';

await test('interface role matrix mirrors the intended visibility rules', () => {
  assert.equal(canWriteData('viewer'), false);
  assert.equal(canOperateTickets('viewer'), false);
  assert.equal(canTestGlpi('viewer'), false);
  assert.equal(canWriteData('operator'), true);
  assert.equal(canOperateTickets('operator'), true);
  assert.equal(canTestGlpi('operator'), false);
  assert.equal(canWriteData('admin'), true);
  assert.equal(canOperateTickets('admin'), true);
  assert.equal(canTestGlpi('admin'), true);
});

await test('role labels are localized for the account indicator', () => {
  assert.equal(roleLabel('viewer'), 'Visualização');
  assert.equal(roleLabel('operator'), 'Operação');
  assert.equal(roleLabel('admin'), 'Administrador');
});
