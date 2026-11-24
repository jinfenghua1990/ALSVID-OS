const { scrypt: rawScrypt, timingSafeEqual } = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(rawScrypt);

// Only explicitly migrated accounts may use the V1 encoded password format.
const V1_SCRYPT_SALT = 'alsvid-v1-scrypt';

function parseV1Password(hash) {
  const match = typeof hash === 'string' && hash.match(/^scrypt\$16384\$8\$1\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{86})$/);
  if (!match) return null;
  const salt = Buffer.from(match[1], 'base64url');
  const expected = Buffer.from(match[2], 'base64url');
  if (salt.length !== 16 || expected.length !== 64 || salt.toString('base64url') !== match[1] || expected.toString('base64url') !== match[2]) return null;
  return { salt, expected };
}

async function passwordHash(password, salt) {
  return Buffer.from(await scrypt(password, salt, 64)).toString('hex');
}

async function verifyPassword(password, salt, hash) {
  const input = typeof password === 'string' ? password.slice(0, 200) : '';
  if (salt === V1_SCRYPT_SALT) {
    const parsed = parseV1Password(hash);
    if (!parsed) return false;
    const actual = Buffer.from(await scrypt(input, parsed.salt, 64, { N: 16384, r: 8, p: 1 }));
    return timingSafeEqual(actual, parsed.expected);
  }
  if (typeof salt !== 'string' || typeof hash !== 'string' || !/^[0-9a-f]{128}$/.test(hash)) return false;
  const actual = Buffer.from(await passwordHash(input, salt), 'hex');
  return timingSafeEqual(actual, Buffer.from(hash, 'hex'));
}

module.exports = { passwordHash, verifyPassword, parseV1Password, V1_SCRYPT_SALT };
