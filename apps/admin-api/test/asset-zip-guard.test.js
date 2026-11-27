'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { EventEmitter } = require('node:events');
const { readZipBody, createZipGate } = require('../asset-zip-guard');

test('ZIP body preserves bytes at the exact limit', async () => {
  const data = await readZipBody(Readable.from([Buffer.from('ab'), Buffer.from('cd')]), 4);
  assert.equal(data.toString(), 'abcd');
});
test('ZIP body rejects actual oversize and invalid object stream', async () => {
  await assert.rejects(readZipBody(Readable.from([Buffer.alloc(4), Buffer.alloc(1)]), 4), { statusCode: 413 });
  await assert.rejects(readZipBody(null, 4), { statusCode: 502 });
});
test('ZIP gate blocks concurrent work through response finish', () => {
  const acquire = createZipGate();
  const raw = new EventEmitter();
  const done = acquire(raw);
  done();
  assert.throws(() => acquire(new EventEmitter()), { statusCode: 429 });
  raw.emit('finish');
  const next = new EventEmitter();
  acquire(next)();
  next.emit('close');
});
test('early client disconnect does not unlock an in-progress build', () => {
  const acquire = createZipGate();
  const raw = new EventEmitter();
  const done = acquire(raw);
  raw.emit('close');
  assert.throws(() => acquire(new EventEmitter()), { statusCode: 429 });
  done();
  const next = new EventEmitter();
  acquire(next)();
  next.emit('finish');
});
