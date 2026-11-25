// 修复装修内容里的旧官网图片引用 → R2（/api/public/home-media/<id>）
//
// 背景：首页装修内容从旧官网整页迁移而来，图片仍指向 https://www.alsvidbike.com/_next/image...
// 该图片优化接口属于旧站自身，域名切换后会 404。此脚本把它改写到 R2 素材接口。
//
// 用法：
//   node scripts/fix-layout-image-refs.js --dry-run   # 只报告，不写库
//   node scripts/fix-layout-image-refs.js             # 写库
//
// 前置：先跑 scripts/migrate-home-media-to-r2.js 得到 /tmp/alsvid-media-map.json
// 数据形态：storefront_layout_drafts.published 为 jsonb
//   - published.html            → 中文（zh）源，de/en 由翻译层运行时渲染
//   - published.locales.{de,en} → 各语言已发布快照，需同步修复
// 编码：内容为 "gz1:" + base64(gzip(utf8))
//
// 回滚：写库前会把原始 published 备份到 backups/layout-before-image-fix-<ts>.json

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');
if (process.env.ALSVID_APPROVE_PRODUCTION_MAINTENANCE !== '1' || process.env.ALSVID_TEST_MODE === '1') throw new Error('历史生产维护脚本默认禁用');

const ROOT = path.resolve(__dirname, '..');
const SERVER = path.join(ROOT, 'apps', 'admin-api');
const MAP_FILE = '/tmp/alsvid-media-map.json';
const DRY_RUN = process.argv.includes('--dry-run');

function loadSecret() {
  const out = execFileSync('/Users/gino/google-cloud-sdk/bin/gcloud',
    ['secrets', 'versions', 'access', 'latest', '--secret=alsvid-v2-runtime', '--project=alsvid-prod', '--quiet'],
    { encoding: 'utf8', timeout: 60000 });
  return JSON.parse(out);
}

const unpack = (v) => (typeof v === 'string' && v.startsWith('gz1:')
  ? zlib.gunzipSync(Buffer.from(v.slice(4), 'base64')).toString('utf8')
  : v);
const pack = (t) => 'gz1:' + zlib.gzipSync(Buffer.from(t, 'utf8')).toString('base64');
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function rewrite(html, mapping) {
  let out = html;
  let count = 0;
  const detail = {};
  for (const { oldPath, newUrl } of mapping) {
    // 形式一：旧站 Next 图片优化接口（多宽度变体，统一收敛到同一 R2 资源）
    const reNext = new RegExp(
      'https://www\\.alsvidbike\\.com/_next/image\\?url=' + escapeRe(encodeURIComponent(oldPath)) + '(&amp;|&)w=\\d+(&amp;|&)q=\\d+', 'g');
    out = out.replace(reNext, () => { count += 1; return newUrl; });
    // 形式二：旧站绝对静态地址
    const reAbs = new RegExp('https://www\\.alsvidbike\\.com' + escapeRe(oldPath), 'g');
    out = out.replace(reAbs, () => { count += 1; return newUrl; });
    const hit = out.split(newUrl).length - 1;
    if (hit) detail[oldPath] = hit;
  }
  return { out, count };
}

(async () => {
  if (!fs.existsSync(MAP_FILE)) throw new Error(`缺少映射文件 ${MAP_FILE}，请先运行 migrate-home-media-to-r2.js`);
  const mapping = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));

  const secret = loadSecret();
  process.env.DATABASE_URL = secret.DATABASE_URL;
  const { createPool } = require(path.join(SERVER, 'db-pool.js'));
  const pool = createPool(secret.DATABASE_URL, { max: 2 });

  const row = (await pool.query('SELECT published FROM storefront_layout_drafts WHERE slug=$1', ['home'])).rows[0];
  if (!row?.published) throw new Error('没有已发布的首页装修内容');

  const original = row.published;
  const next = { ...original };
  const locales = original.locales && typeof original.locales === 'object' ? original.locales : {};

  // 中文源（顶层 html）
  const zh = rewrite(unpack(original.html || ''), mapping);
  next.html = pack(zh.out);
  console.log(`zh : 替换 ${zh.count} 处 → ${zh.out.length}B，剩余 _next/image=${(zh.out.match(/_next\/image/g) || []).length}`);

  // 各语言已发布快照
  next.locales = { ...locales };
  for (const code of Object.keys(locales)) {
    const snapshot = locales[code] || {};
    const r = rewrite(unpack(snapshot.html || ''), mapping);
    next.locales[code] = { ...snapshot, html: pack(r.out) };
    console.log(`${code} : 替换 ${r.count} 处 → ${r.out.length}B，剩余 _next/image=${(r.out.match(/_next\/image/g) || []).length}`);
  }

  if (DRY_RUN) {
    console.log('\n[dry-run] 未写库。');
    await pool.end();
    return;
  }

  const backupDir = path.join(ROOT, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `layout-before-image-fix-${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(original));
  console.log(`\n已备份原始 published → ${backupFile}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE storefront_layout_drafts SET published=$1::jsonb, updated_at=now() WHERE slug=$2',
      [JSON.stringify(next), 'home']);
    await client.query('COMMIT');
    console.log('✓ 已写库。注意：8089 的 layout 有 5 分钟进程内缓存，需重启服务才会对外生效。');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await pool.end();
})().catch((error) => { console.error('失败:', error.message); process.exit(1); });
