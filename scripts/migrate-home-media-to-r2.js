// 把装修内容依赖的旧官网图片迁入 R2 + media_assets（幂等，仅新增）
// 复用 createAssetLibraryStore().upload()，不手拼 SQL。
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
if (process.env.ALSVID_APPROVE_PRODUCTION_MAINTENANCE !== '1' || process.env.ALSVID_TEST_MODE === '1') throw new Error('历史生产维护脚本默认禁用');

const ROOT = path.resolve(__dirname, '..');
const SERVER = path.join(ROOT, 'apps', 'admin-api');

function loadSecret() {
  const out = execFileSync('/Users/gino/google-cloud-sdk/bin/gcloud',
    ['secrets', 'versions', 'access', 'latest', '--secret=alsvid-v2-runtime', '--project=alsvid-prod', '--quiet'],
    { encoding: 'utf8', timeout: 60000 });
  return JSON.parse(out);
}

function contentTypeOf(file) {
  const ext = path.extname(file).toLowerCase();
  return { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' }[ext] || '';
}

const TARGETS = [
  { file: '/tmp/alsvid-fetch/scene-city.webp', label: '首页城市骑行场景', oldPath: '/home/original/scene-city.webp' },
  { file: '/tmp/alsvid-fetch/fc1-product.webp', label: '首页 FC1 产品图', oldPath: '/home/original/fc1-product.webp' },
  { file: '/tmp/alsvid-fetch/scene-touring.webp', label: '首页长途骑行场景', oldPath: '/home/original/scene-touring.webp' },
  { file: '/tmp/alsvid-fetch/alsvid-bike-motion.svg', label: '首页动效线条 SVG', oldPath: '/home/alsvid-bike-motion.svg' },
  { file: path.join(ROOT, 'apps/admin-web/public/products/fc2/side-studio-1536.webp'), label: 'FC2 侧面棚拍', oldPath: '/products/fc2/side-studio-1536.webp' },
  { file: path.join(ROOT, 'apps/admin-web/public/products/l7/reference-side.jpg'), label: 'L7 侧面参考图', oldPath: '/products/l7/reference-side.jpg' },
  { file: path.join(ROOT, 'apps/admin-web/public/products/l8/retouched-side.webp'), label: 'L8 精修侧面图', oldPath: '/products/l8/retouched-side.webp' },
  { file: path.join(ROOT, 'apps/admin-web/public/products/accessories/cup-holder/retouched/cup-holder-black.webp'), label: '杯架配件黑色', oldPath: '/products/accessories/cup-holder/retouched/cup-holder-black.webp' },
];

(async () => {
  const secret = loadSecret();
  process.env.DATABASE_URL = secret.DATABASE_URL;
  for (const key of ['OBJECT_STORAGE_PROVIDER', 'OBJECT_STORAGE_ENDPOINT', 'OBJECT_STORAGE_BUCKET', 'OBJECT_STORAGE_REGION', 'OBJECT_STORAGE_ACCESS_KEY', 'OBJECT_STORAGE_SECRET_KEY']) {
    if (secret[key]) process.env[key] = secret[key];
  }

  const { createObjectStorage } = require(path.join(SERVER, 'object-storage.js'));
  const { createAssetLibraryStore } = require(path.join(SERVER, 'asset-library.js'));
  const objectStorage = createObjectStorage(process.env);
  if (!objectStorage) throw new Error('对象存储未配置');
  const store = createAssetLibraryStore(process.env.DATABASE_URL, objectStorage);

  const results = [];
  for (const t of TARGETS) {
    const body = fs.readFileSync(t.file);
    const contentType = contentTypeOf(t.file);
    const isSvg = contentType === 'image/svg+xml';
    const res = await store.upload({
      contentType,
      fileName: path.basename(t.file),
      body,
      trustedHomeSvg: isSvg,
      meta: {
        category: 'page',
        folder: '首页装修',
        visibility: 'public',
        status: 'published',
        label: t.label,
      },
    });
    const asset = res.asset;
    results.push({ oldPath: t.oldPath, id: asset.id, folder: asset.folder, visibility: asset.visibility, status: asset.status, reused: res.reused, bytes: body.length, newUrl: `/api/public/home-media/${asset.id}` });
    console.log(`${res.reused ? '复用' : '新增'}  ${t.oldPath}  ->  ${asset.id}  (${asset.folder}/${asset.visibility}/${asset.status})`);
  }

  fs.writeFileSync('/tmp/alsvid-media-map.json', JSON.stringify(results, null, 2));
  console.log('\n映射已写入 /tmp/alsvid-media-map.json；共', results.length, '项');
  await store.close();
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
