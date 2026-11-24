'use strict';

const { assertApplicationDatabase } = require('../db-pool');

function assertIsolatedTestDatabase(connectionString = process.env.TEST_DATABASE_URL) {
  if (!connectionString || connectionString !== process.env.TEST_DATABASE_URL || process.env.ALSVID_TEST_MODE !== '1') {
    throw new Error('Database tests require the explicit TEST_DATABASE_URL in ALSVID_TEST_MODE.');
  }
  assertApplicationDatabase(connectionString);
  return new URL(connectionString);
}

module.exports = { assertIsolatedTestDatabase };
