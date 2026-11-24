'use strict';
// 测试入口：有 TEST_DATABASE_URL 时跑全量；否则只跑不依赖数据库的单元测试。
// 依赖数据库的测试会 INSERT 测试数据，必须指向隔离库，绝不能指向生产库。
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const dir = __dirname;
const all = fs.readdirSync(dir).filter(f => f.endsWith('.test.js')).sort();
const needsDb = f => {
  const source = fs.readFileSync(path.join(dir, f), 'utf8');
  return (source.includes('DATABASE_URL') || source.includes('assertIsolatedTestDatabase')) && !source.includes('UNIT_TEST_NO_DATABASE');
};

const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const selected = hasDb ? all : all.filter(f => !needsDb(f));
const skipped = all.length - selected.length;

if (!hasDb && skipped > 0) {
  console.log(`[test] 未设置 TEST_DATABASE_URL，跳过 ${skipped} 个需要隔离数据库的测试（共 ${all.length} 个）。`);
  console.log('[test] 需要跑全量时：TEST_DATABASE_URL=<隔离库连接串> npm test');
}

const files = selected.map(f => path.join(dir, f));
const result = spawnSync(process.execPath, ['--test', ...files], {
  stdio: 'inherit',
  env: { ...process.env, ...(hasDb ? { ALSVID_TEST_MODE: '1' } : {}) },
});
process.exit(result.status ?? 1);
