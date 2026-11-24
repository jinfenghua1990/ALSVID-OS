import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsDraftIdentityRecovery, recoverDraftIdentity } from '../src/draft-identity.js';

const v7 = '019a0000-0000-7000-8000-000000000001';
const v7Image = '019a0000-0000-7000-8000-000000000002';
const v4 = '12345678-1234-4234-8234-123456789abc';
const v4Image = '12345678-1234-4234-8234-123456789abd';

test('restores prefixed v7 draft without discarding content', async () => {
  const draft = { id: `p-${v7}`, name: 'sample', images: [], bom: { items: [] } };
  const checked = []; let saved;
  const result = await recoverDraftIdentity(draft, async id => { checked.push(id); return false; }, async next => { saved = next; });
  assert.deepEqual(checked, [`p-${v7}`, v7]);
  assert.equal(result.id, v7);
  assert.equal(result.name, 'sample');
  assert.deepEqual(saved, result);
  assert.equal(draft.id, `p-${v7}`);
});

test('upgrades old draft and image identifiers while preserving drawing references', async () => {
  const draft = { id: `p-${v4}`, images: [{ id: v4Image, data: 'unchanged' }], bom: { items: [{ drawingMediaId: v4Image, drawingX: 0.5 }] } };
  const ids = [v7, v7Image]; let saved;
  const result = await recoverDraftIdentity(draft, async () => false, async next => { saved = next; }, () => ids.shift());
  assert.equal(result.id, v7);
  assert.equal(result.images[0].id, v7Image);
  assert.equal(result.images[0].data, 'unchanged');
  assert.equal(result.bom.items[0].drawingMediaId, v7Image);
  assert.equal(result.bom.items[0].drawingX, 0.5);
  assert.deepEqual(saved, result);
  assert.equal(draft.images[0].id, v4Image);
});

test('recovers legacy image identifiers even when the product identifier is already v7', async () => {
  const draft = { id: v7, images: [{ id: v4Image, data: 'unchanged' }] };
  const ids = [v7Image]; let saved;
  assert.equal(needsDraftIdentityRecovery(draft), true);
  const result = await recoverDraftIdentity(draft, async () => false, async next => { saved = next; }, () => ids.shift());
  assert.equal(result.id, v7);
  assert.equal(result.images[0].id, v7Image);
  assert.deepEqual(saved, result);
});

test('does not overwrite a draft when a product already exists or storage fails', async () => {
  const draft = { id: `p-${v7}`, images: [] }; let saved = false;
  await assert.rejects(recoverDraftIdentity(draft, async () => true, async () => { saved = true; }), /已经保存/);
  assert.equal(saved, false);
  await assert.rejects(recoverDraftIdentity(draft, async () => false, async () => { throw Error('storage failed'); }), /storage failed/);
  assert.equal(draft.id, `p-${v7}`);
});

test('retains the original draft when new identity collides or lookup fails', async () => {
  const draft = { id: `p-${v7}`, images: [] }; let calls = 0, saved = false;
  await assert.rejects(recoverDraftIdentity(draft, async () => ++calls === 2, async () => { saved = true; }), /已被使用/);
  assert.equal(saved, false);
  await assert.rejects(recoverDraftIdentity(draft, async () => { throw Error('network failed'); }, async () => { saved = true; }), /network failed/);
  assert.equal(saved, false);
});
