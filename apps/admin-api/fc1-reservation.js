const { isUuidv7 } = require('./uuidv7');
// Ordinary reservation interest is separate from a confirmed order or test ride.
function normalizeReservation(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || (input.purpose !== undefined && input.purpose !== 'reservation')) return null;
  if (typeof input.email !== 'string' || typeof input.model !== 'string' || typeof input.colour !== 'string') return null;
  const email = input.email.trim().toLowerCase(), model = input.model.trim(), colour = input.colour.trim();
  if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return null;
  if (!model || model.length > 40 || !colour || colour.length > 60 || /[\x00-\x1f\x7f]/.test(model + colour)) return null;
  if (!['zh', 'en', 'de'].includes(input.locale)) return null;
  return { email, model, colour, locale: input.locale };
}

function reservationNotification(input) {
  const escape = value => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  return {
    subject: 'ALSVID FC1 reservation enquiry',
    text: `FC1 reservation enquiry\nEmail: ${input.email}\nModel: ${input.model}\nColour: ${input.colour}\nLocale: ${input.locale}\n\nThis is an interest request only. No payment or order was created.`,
    html: `<p><strong>FC1 reservation enquiry</strong></p><p>Email: ${escape(input.email)}<br>Model: ${escape(input.model)}<br>Colour: ${escape(input.colour)}<br>Locale: ${escape(input.locale)}</p><p>No payment or order was created.</p>`,
  };
}

function createReservationMailer({ apiKey, from, recipient, fetchImpl = fetch }) {
  if (!apiKey || !from || !recipient) return null;
  return async (input, requestId) => {
    if (!isUuidv7(requestId)) throw Error('Invalid request identifier');
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'Idempotency-Key': `fc1-reservation/${requestId}` },
      body: JSON.stringify({ from, to: [recipient], ...reservationNotification(input) }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw Error('Reservation notification could not be sent');
  };
}

function createTestRideMailer({ apiKey, from, recipient, fetchImpl = fetch }) {
  if (!apiKey || !from || !recipient) return null;
  return async (input, requestId) => {
    if (!isUuidv7(requestId)) throw Error('Invalid request identifier');
    const text = `FC1 test-ride interest (not a confirmed booking)\nName: ${input.name || 'Not provided'}\nEmail: ${input.email}\nCountry: ${input.country}\nCity: ${input.city}\nModel: ${input.model}\nColour: ${input.colour}\nLocale: ${input.locale}\n\nNo test ride appointment, payment or order was created.`;
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'Idempotency-Key': `fc1-test-ride/${requestId}` },
      body: JSON.stringify({ from, to: [recipient], subject: 'ALSVID FC1 test ride enquiry', text }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw Error('Test-ride notification could not be sent');
  };
}

module.exports = { normalizeReservation, reservationNotification, createReservationMailer, createTestRideMailer };
