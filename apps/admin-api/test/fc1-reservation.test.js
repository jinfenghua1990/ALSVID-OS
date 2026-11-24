const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeReservation, reservationNotification, createReservationMailer, createTestRideMailer } = require('../fc1-reservation');

test('reservation input is bounded and cannot be confused with a test ride', () => {
  const input = { email: ' User@Example.com ', model: 'A1 Ultra', colour: '<blue>', locale: 'en' };
  const value = normalizeReservation(input);
  assert.equal(value.email, 'user@example.com');
  assert.equal(normalizeReservation({ ...input, purpose: 'test_ride' }), null);
  assert.equal(normalizeReservation({ ...input, model: 'bad\nheader' }), null);
  assert.equal(normalizeReservation({ ...input, email: 'bad@example.com\nBcc: x' }), null);
  assert.equal(normalizeReservation({ ...input, locale: 'fr' }), null);
  const message = reservationNotification(value);
  assert.match(message.html, /&lt;blue&gt;/);
  assert.doesNotMatch(message.html, /<blue>/);
  assert.match(message.text, /No payment or order was created/);
});

test('test-ride notification is sent to the configured recipient with a stable key', async () => {
  let call;
  const send=createTestRideMailer({apiKey:'test',from:'sender@example.invalid',recipient:'team@example.invalid',fetchImpl:async(url,options)=>{call={url,options};return {ok:true}}});
  const id='01890f3e-7b13-7aa9-b123-123456789abc';
  await send({name:'Example',email:'rider@example.invalid',country:'DE',city:'Berlin',model:'A1 Ultra',colour:'Blue',locale:'en'},id);
  const body=JSON.parse(call.options.body);
  assert.deepEqual(body.to,['team@example.invalid']);
  assert.match(body.text,/not a confirmed booking/);
  assert.equal(call.options.headers['Idempotency-Key'],`fc1-test-ride/${id}`);
});

test('reservation mail uses a fixed recipient and a stable request key', async () => {
  assert.equal(createReservationMailer({}), null);
  const calls = [];
  const send = createReservationMailer({ apiKey: 'test', from: 'sender@example.invalid', recipient: 'team@example.invalid', fetchImpl: async (url, options) => { calls.push({ url, options }); return { ok: true }; } });
  const input = normalizeReservation({ email: 'user@example.invalid', model: 'A1 Ultra', colour: 'blue', locale: 'en' });
  const id = '01890f3e-7b13-7aa9-b123-123456789abc';
  await send(input, id);
  await send(input, id);
  assert.equal(calls[0].options.headers['Idempotency-Key'], calls[1].options.headers['Idempotency-Key']);
  assert.deepEqual(JSON.parse(calls[0].options.body).to, ['team@example.invalid']);
  await assert.rejects(send(input, 'invalid'));
  const fail = createReservationMailer({ apiKey: 'test', from: 'sender@example.invalid', recipient: 'team@example.invalid', fetchImpl: async () => ({ ok: false }) });
  await assert.rejects(fail(input, id));
});
