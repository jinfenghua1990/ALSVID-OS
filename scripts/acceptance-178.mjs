#!/usr/bin/env node
// 上线验收 01 + 02：在**隔离测试库**上跑完「迁移 178 → 发布 → 版本记录 → 回滚 → 校验」。
//
// 安全边界：
// - 只接受 Neon 隔离分支（沿用 server/db-pool.js 的既有护栏：必须 *.neon.tech、
//   不能是共享生产主机、不能是本地库）。护栏不绕过、不改写。
// - 不改正式库、不改正式域名、不改 GitHub。
// - 每一步都打印 PASS/FAIL 与原始响应片段，失败即停，不留半完成状态。
//
// 用法（在项目根目录）：
//   ALSVID_TEST_MODE=1 \
//   TEST_DATABASE_URL='postgres://...@ep-xxx.eu-central-1.aws.neon.tech/neondb' \
//   DATABASE_URL_UNPOOLED="$TEST_DATABASE_URL" \
//   ALSVID_ADMIN_BASE=http://127.0.0.1:18089 \
//   ALSVID_ADMIN_USER=... ALSVID_ADMIN_PASS=... \
//   node scripts/acceptance-178.mjs
//
// 前置：把 8089 指向该测试库启动（ALSVID_SECRET_JSON 里 DATABASE_URL 换成测试库），
// 并在该库上执行过一次 `node apps/admin-api/migrate.js`（首次建库需要）。
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const serverDir = fileURLToPath(new URL('../apps/admin-api/', import.meta.url));
const { assertApplicationDatabase, createPool } = require(path.join(serverDir, 'db-pool.js'));

const TEST_URL = process.env.TEST_DATABASE_URL || '';
const BASE = (process.env.ALSVID_ADMIN_BASE || 'http://127.0.0.1:18089').replace(/\/+$/, '');
const USER = process.env.ALSVID_ADMIN_USER || '';
const PASS = process.env.ALSVID_ADMIN_PASS || '';

const results = [];
function record(step, ok, detail) {
  results.push({ step, ok, detail });
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${step}${detail ? `  —  ${detail}` : ''}\n`);
  if(!ok)die('验收失败：'+step);
}
function die(message) {
  process.stdout.write(`\n中止：${message}\n`);
  printSummary();
  process.exit(1);
}
function printSummary() {
  const pass = results.filter((item) => item.ok).length;
  process.stdout.write(`\n合计 ${results.length} 项：通过 ${pass}，失败 ${results.length - pass}\n`);
}

if (process.env.ALSVID_TEST_MODE !== '1') die('必须显式设置 ALSVID_TEST_MODE=1');
if (!TEST_URL) die('缺少 TEST_DATABASE_URL（必须指向 Neon 隔离测试分支，不能是正式库）');
if (BASE !== 'http://127.0.0.1:18089') die('仅允许独立测试 API 18089');
const direct = process.env.DATABASE_URL_UNPOOLED || process.env.DIRECT_DATABASE_URL || TEST_URL;
if (direct !== TEST_URL) die('迁移连接串与 TEST_DATABASE_URL 不一致');
process.env.DATABASE_URL_UNPOOLED = TEST_URL;
delete process.env.DIRECT_DATABASE_URL;
if (!USER || !PASS) die('缺少 ALSVID_ADMIN_USER / ALSVID_ADMIN_PASS（测试分支的临时管理员）');

// 复用既有护栏做校验：这一步本身就是验收项 —— 确认「测试库不是正式库」
try {
  assertApplicationDatabase(TEST_URL);
  record('测试库护栏校验（非正式库 / 非本地库）', true, TEST_URL.replace(/\/\/[^@]*@/, '//***@'));
} catch (error) {
  record('测试库护栏校验（非正式库 / 非本地库）', false, error.message);
  die('测试库不满足隔离要求，请使用 Neon 隔离分支');
}

// ---------------- 01. 迁移 178 ----------------
process.stdout.write('\n— 01 迁移 178 —\n');
const { migrate } = require(path.join(serverDir, 'migrate.js'));
try {
  await migrate();
  record('迁移执行（migrate.js）', true, '全部待应用迁移已提交');
} catch (error) {
  record('迁移执行（migrate.js）', false, error.message);
  die('迁移失败，后续步骤无意义');
}

const pool = createPool(TEST_URL, { max: 2 });
try {
  const table = await pool.query("SELECT to_regclass('alsvid_v2.storefront_layout_versions') IS NOT NULL AS ready");
  record('版本表已建立', table.rows[0].ready === true, 'storefront_layout_versions');

  const columns = await pool.query(
    "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='alsvid_v2' AND table_name='storefront_layout_versions' ORDER BY ordinal_position",
  );
  const expected = ['id', 'slug', 'version', 'snapshot', 'published_by', 'published_at', 'origin', 'rolled_back_from', 'note', 'created_at'];
  const found = columns.rows.map((row) => row.column_name);
  record('版本表字段完整', expected.every((name) => found.includes(name)), found.join(', '));

  const indexes = await pool.query("SELECT indexname FROM pg_indexes WHERE schemaname='alsvid_v2' AND tablename='storefront_layout_versions'");
  const names = indexes.rows.map((row) => row.indexname);
  record('(slug, version) 唯一索引存在', names.some((name) => name.includes('slug_version')), names.join(', '));

  const migrationRow = await pool.query("SELECT sha256 FROM alsvid_v2.schema_migrations WHERE name='178_storefront_layout_versions.sql'");
  record('迁移已登记进 schema_migrations', migrationRow.rowCount === 1, migrationRow.rows[0]?.sha256?.slice(0, 16) || '');
} finally {
  await pool.end().catch(() => {});
}

// ---------------- 02. 发布 / 版本 / 回滚 ----------------
process.stdout.write('\n— 02 发布、版本记录、回滚 —\n');
const jar = new Map();
async function call(method, url, body) {
  const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const response = await fetch(BASE + url, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000),
  });
  for (const raw of response.headers.getSetCookie?.() || []) {
    const [pair] = raw.split(';');
    const index = pair.indexOf('=');
    if (index > 0) jar.set(pair.slice(0, index), pair.slice(index + 1));
  }
  const payload = await response.json().catch(() => null);
  return { status: response.status, payload };
}

const login = await call('POST', '/api/auth/login', { username: USER, password: PASS });
if (login.status !== 200) die(`登录失败（${login.status}）：${login.payload?.error || ''}`);
record('管理员登录', true, '会话已建立');
const connection = await call('GET', '/api/system/connections');
const expectedDb = new URL(TEST_URL);
const expectedTarget = `${expectedDb.host} · ${decodeURIComponent(expectedDb.pathname.replace(/^\/+/, ''))}`;
if (connection.status !== 200 || !connection.payload?.connections?.some(item => item.id === 'database' && item.target === expectedTarget && item.status === 'connected')) die('API 实际数据库与隔离测试库不一致，禁止发布验收');

const draft = await call('GET', '/api/site/layout-draft');
const version = draft.payload?.data?.version;
record('读取草稿', draft.status === 200 && Number.isSafeInteger(version), `当前草稿 v${version}`);

const project=draft.payload?.data?.project||{components:[],styles:[]};
const WEB='http://127.0.0.1:18091';
async function verifyPage(locale,release,label){
 const response=await fetch(WEB+'/'+locale,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30000)});
 const body=await response.text();
 record(`真实前台 ${locale} · ${label}`,response.ok&&body.includes(`data-alsvid-layout-version="${release}"`)&&(release==='unpublished'||body.includes(label)),`HTTP ${response.status} · ${release}`);
}
const html = `<section style="padding:48px;text-align:center"><h1>验收版式 A ${Date.now()}</h1></section>`;
const saved = await call('PUT', '/api/site/layout-draft', { project,html, css: '', translations: {}, expectedVersion: version });
const savedVersion = saved.payload?.data?.version;
record('保存草稿', saved.status === 200 && savedVersion > version, `v${version} → v${savedVersion}`);

const publishA = await call('POST', '/api/site/layout-draft/publish', { expectedVersion: savedVersion, html, css: '', locales: {} });
record('发布版本 A', publishA.status === 200, `publishedVersion=${publishA.payload?.data?.publishedVersion}`);
const versionA = publishA.payload?.data?.publishedVersion;
record('发布 A 缓存回调',publishA.payload?.data?.storefrontRevalidate?.ok===true);
await verifyPage('zh',versionA,'验收版式 A');
const repeat=await call('POST','/api/site/layout-draft/publish',{expectedVersion:savedVersion,html,css:'',locales:{}});
record('同一草稿再次发布生成独立快照',repeat.status===200&&repeat.payload?.data?.publishedVersion>versionA);
await verifyPage('zh',repeat.payload.data.publishedVersion,'验收版式 A');

// 再发一版，制造「回滚到上一版」的真实场景
const saved2 = await call('PUT', '/api/site/layout-draft', { project,html: html.replace('版式 A', '版式 B'), css: '', translations: {}, expectedVersion: savedVersion });
const publishB = await call('POST', '/api/site/layout-draft/publish', { expectedVersion: saved2.payload?.data?.version, html: html.replace('版式 A', '版式 B'), css: '', locales: {} });
record('发布版本 B', publishB.status === 200, `publishedVersion=${publishB.payload?.data?.publishedVersion}`);
const versionB = publishB.payload?.data?.publishedVersion;
record('发布 B 缓存回调',publishB.payload?.data?.storefrontRevalidate?.ok===true);
await verifyPage('zh',versionB,'验收版式 B');

const list = await call('GET', '/api/site/layout-draft/versions?limit=20');
const items = list.payload?.data?.items || [];
record('版本列表可用', list.payload?.data?.available === true && items.length >= 2, `available=${list.payload?.data?.available} 条数=${items.length}`);
record('版本 A/B 都在历史里', items.some((item) => item.version === versionA) && items.some((item) => item.version === versionB), items.map((item) => `v${item.version}`).join(','));

const detail = await call('GET', `/api/site/layout-draft/versions/${versionA}`);
record('版本详情可读（含快照正文）', detail.status === 200 && String(detail.payload?.data?.html || '').includes('版式 A'), `v${versionA} 正文长度=${String(detail.payload?.data?.html || '').length}`);

const rollback = await call('POST', '/api/site/layout-draft/rollback', { version: versionA, note: '验收脚本回滚' });
record('回滚到版本 A', rollback.status === 200, `当前线上版本=${rollback.payload?.data?.publishedVersion}`);

const layout = await call('GET', '/api/site/layout?locale=zh');
record('线上版式已回到 A', String(layout.payload?.data?.html || layout.payload?.html || '').includes('版式 A'), `version=${layout.payload?.data?.version ?? layout.payload?.version ?? '—'}`);

record('回滚缓存回调',rollback.payload?.data?.storefrontRevalidate?.ok===true);
await verifyPage('zh',rollback.payload.data.publishedVersion,'验收版式 A');
const rollbackAgain = await call('POST', '/api/site/layout-draft/rollback', { version: versionA });
record('重复回滚被拒（409）', rollbackAgain.status === 409, rollbackAgain.payload?.error || '');

const withdrawn=await call('POST','/api/site/layout-draft/unpublish',{});
record('撤回并刷新缓存',withdrawn.status===200&&withdrawn.payload?.storefrontRevalidate?.ok===true);
await verifyPage('zh','unpublished','撤回');
printSummary();
const failed = results.filter((item) => !item.ok).length;
process.exitCode = failed ? 1 : 0;
