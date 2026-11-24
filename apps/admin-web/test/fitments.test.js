import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveFitments, fitmentError, fitmentPayload } from '../src/fitments.js';

const vehicles = [
  { id: 'old-a', entityUuid: 'uuid-a', model: 'A1', name: 'A' },
  { id: 'old-b', entityUuid: 'uuid-b', model: 'A1', name: 'B' },
];

test('UUID selects the intended vehicle even when models match', () => {
  const fits = resolveFitments([{ vehicleUuid: 'uuid-b', vehicleModel: 'A1', note: 'fit' }], vehicles);
  assert.equal(fits[0].vehicleId, 'old-b');
  assert.equal(fitmentError(fits, vehicles), '');
  assert.deepEqual(fitmentPayload(fits, vehicles), [{ vehicleUuid: 'uuid-b', vehicleModel: 'A1', note: 'fit' }]);
});

test('ambiguous or missing legacy entries remain pending confirmation', () => {
  const fits = resolveFitments([{ vehicleModel: 'A1', note: 'keep' }, { vehicleModel: 'missing' }], vehicles);
  assert.deepEqual(fits.map(f => f.vehicleId), ['', '']);
  assert.equal(fits[0].note, 'keep');
  assert.match(fitmentError(fits, vehicles), /确认或移除/);
});

test('old backend cannot save ambiguous models or repeated selections', () => {
  const oldVehicles = vehicles.map(({ entityUuid, ...v }) => v);
  assert.match(fitmentError([{ vehicleId: 'old-a' }], oldVehicles), /更新后端/);
  assert.match(fitmentError([{ vehicleId: 'old-a' }, { vehicleId: 'old-a' }], vehicles), /重复/);
  assert.equal(resolveFitments([{ vehicleModel: 'A1' }], [oldVehicles[0]])[0].vehicleId, 'old-a');
});
