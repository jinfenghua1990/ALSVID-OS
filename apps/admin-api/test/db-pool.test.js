'use strict';
// UNIT_TEST_NO_DATABASE: this validates connection URL guards without opening a connection.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertApplicationDatabase } = require('../db-pool');

test('application database accepts only the explicitly configured isolated Neon test URL in test mode', () => {
  const priorMode = process.env.ALSVID_TEST_MODE;
  const priorTestUrl = process.env.TEST_DATABASE_URL;
  const productionUrl = 'postgresql://user:pass@ep-shy-truth-b9laycln.c-7.eu-central-1.aws.neon.tech/ALSVID%20Production';
  const isolatedUrl = 'postgresql://user:pass@ep-test-example.c-7.eu-central-1.aws.neon.tech/alsvid_test';
  try {
    process.env.ALSVID_TEST_MODE = '1';
    process.env.TEST_DATABASE_URL = isolatedUrl;
    assert.doesNotThrow(() => assertApplicationDatabase(isolatedUrl));
    const inheritedDatabaseName = 'postgresql://user:pass@ep-test-branch-b9laycln.c-7.eu-central-1.aws.neon.tech/ALSVID%20Production';
    process.env.TEST_DATABASE_URL = inheritedDatabaseName;
    assert.doesNotThrow(() => assertApplicationDatabase(inheritedDatabaseName));
    process.env.TEST_DATABASE_URL = productionUrl;
    assert.throws(() => assertApplicationDatabase(productionUrl), /isolated Neon database/);
    process.env.TEST_DATABASE_URL = 'postgresql://user:pass@localhost/alsvid_test';
    assert.throws(() => assertApplicationDatabase(process.env.TEST_DATABASE_URL), /isolated Neon database/);
    process.env.TEST_DATABASE_URL = 'postgresql://user:pass@other.example/alsvid_test';
    assert.throws(() => assertApplicationDatabase(process.env.TEST_DATABASE_URL), /isolated Neon database/);
    process.env.TEST_DATABASE_URL = isolatedUrl;
    process.env.ALSVID_TEST_MODE = '0';
    assert.throws(() => assertApplicationDatabase(isolatedUrl), /Only the shared Neon ALSVID Production database is allowed/);
  } finally {
    if (priorMode === undefined) delete process.env.ALSVID_TEST_MODE;
    else process.env.ALSVID_TEST_MODE = priorMode;
    if (priorTestUrl === undefined) delete process.env.TEST_DATABASE_URL;
    else process.env.TEST_DATABASE_URL = priorTestUrl;
  }
});
