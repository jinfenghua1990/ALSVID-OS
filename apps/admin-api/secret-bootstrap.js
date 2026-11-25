// 读取 V2 运行时配置：优先 Secret Manager，其次 ALSVID_SECRET_JSON 环境变量。
// 任何分支都不打印密钥内容，只输出缺失项与可诊断的错误原因。
const { execSync, execFileSync, spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const SECRET_NAME = process.env.ALSVID_SECRET_NAME || 'alsvid-v2-runtime';
const PROJECT = process.env.ALSVID_GCP_PROJECT || 'alsvid-prod';
const REQUIRED = ['DATABASE_URL', 'OBJECT_STORAGE_ENDPOINT', 'OBJECT_STORAGE_BUCKET', 'OBJECT_STORAGE_ACCESS_KEY', 'OBJECT_STORAGE_SECRET_KEY'];

// gcloud 路径自动探测：不再写死 C:\CloudSDK\...，换机器装到默认位置也能直接跑
function resolveGcloudPath() {
  if (process.env.GCLOUD_BIN && fs.existsSync(process.env.GCLOUD_BIN)) return process.env.GCLOUD_BIN;
  const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
  const candidates = [
    path.join(process.env.HOME || '', 'google-cloud-sdk', 'bin', 'gcloud'),
    'C:\\CloudSDK\\google-cloud-sdk\\bin\\gcloud.cmd',
    'C:\\Program Files (x86)\\Google\\Cloud SDK\\google-cloud-sdk\\bin\\gcloud.cmd',
    'C:\\Program Files\\Google\\Cloud SDK\\google-cloud-sdk\\bin\\gcloud.cmd',
    path.join(localAppData, 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin', 'gcloud.cmd'),
    path.join(localAppData, 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin', 'gcloud.exe'),
    path.join(process.env.USERPROFILE || '', 'google-cloud-sdk', 'bin', 'gcloud.cmd'),
  ];
  for (const candidate of candidates) {
    try { if (candidate && fs.existsSync(candidate)) return candidate; } catch (_) { /* 忽略不可读路径 */ }
  }
  for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    for (const name of ['gcloud.cmd', 'gcloud.exe', 'gcloud.bat']) {
      const full = path.join(dir, name);
      try { if (fs.existsSync(full)) return full; } catch (_) { /* 忽略 */ }
    }
  }
  return '';
}

function describeSecretFailure(stderr, code) {
  if (code === 'ETIMEDOUT') return '读取云端配置超时，请检查网络与代理';
  if (/PERMISSION_DENIED|does not have permission/i.test(stderr)) return `当前账号没有读取密钥 ${SECRET_NAME} 的权限（需要 secretAccessor）`;
  if (/NOT_FOUND|cannot be found|not found/i.test(stderr)) return `项目 ${PROJECT} 中找不到密钥 ${SECRET_NAME}`;
  if (/SSLError|SSL:|TLS|certificate/i.test(stderr)) return '连接云端时 TLS 安全连接失败，请检查网络和证书配置';
  if (/logged in|reauthentication|invalid_grant|credentials.*expired/i.test(stderr)) return 'gcloud 登录可能已失效，请检查登录状态';
  return 'gcloud 读取密钥失败（为避免泄露，未输出原始错误内容）';
}

function proxyEnvironment(env, platform = process.platform, proxyOutput = null) {
  if (env.HTTPS_PROXY || env.https_proxy || platform !== 'darwin') return { ...env };
  let output = proxyOutput;
  if (output === null) {
    try { output = execFileSync('/usr/sbin/scutil', ['--proxy'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (_) { return { ...env }; }
  }
  const value = key => output.match(new RegExp('^\\s*' + key + '\\s*:\\s*(\\S+)\\s*$', 'm'))?.[1];
  const host = value('HTTPSProxy'), port = value('HTTPSPort');
  if (value('HTTPSEnable') !== '1' || !host || !/^[A-Za-z0-9.:-]+$/.test(host) || !/^\d{1,5}$/.test(port || '') || Number(port) < 1 || Number(port) > 65535) return { ...env };
  const proxyHost = host.includes(':') ? `[${host}]` : host;
  return { ...env, HTTPS_PROXY: `http://${proxyHost}:${port}` };
}

function readSecretFromManager() {
  const gcloud = resolveGcloudPath();
  if (!gcloud) throw Error('未找到 gcloud：请安装 Google Cloud SDK，或用 GCLOUD_BIN 指定路径，或改用 ALSVID_SECRET_JSON');
  if (!/^[A-Za-z0-9._-]+$/.test(SECRET_NAME)) throw Error('ALSVID_SECRET_NAME 含非法字符（只允许字母、数字、点、下划线、短横线）');
  if (!/^[A-Za-z0-9._:-]+$/.test(PROJECT)) throw Error('ALSVID_GCP_PROJECT 含非法字符');
  let raw;
  try {
    raw = execSync(`"${gcloud}" secrets versions access latest --secret=${SECRET_NAME} --project=${PROJECT}`, {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, timeout: 20000, env: proxyEnvironment(process.env),
    });
  } catch (error) {
    const stderr = String((error && error.stderr) || '');
    throw Error(describeSecretFailure(stderr, error && error.code));
  }
  return raw;
}

function loadRuntimeEnvironment() {
  if (process.env.ALSVID_TEST_MODE === '1') throw Error('测试模式禁止读取正式环境 Secret Manager');
  let config;
  if (process.env.ALSVID_SECRET_JSON) {
    try { config = JSON.parse(process.env.ALSVID_SECRET_JSON); }
    catch (_) { throw Error('ALSVID_SECRET_JSON 不是合法的 JSON'); }
  } else {
    const raw = readSecretFromManager();
    try { config = JSON.parse(raw); }
    catch (_) { throw Error('密钥内容不是合法的 JSON（应包含 5 个运行时配置项）'); }
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw Error('密钥内容格式不正确');
  }
  for (const key of REQUIRED) {
    if (!config[key]) throw Error('Missing ' + key + ' in ALSVID V2 secret');
  }
  return { ...process.env, ...config };
}

if (require.main === module) {
  try {
    const env = loadRuntimeEnvironment();
    // Normal service restarts must never execute schema changes or seed data.
    const server = spawn(process.execPath, ['index.js'], { cwd: __dirname, env, stdio: 'inherit', windowsHide: true });
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
    server.on('exit', (serverCode) => { process.exitCode = serverCode ?? 1; });
  } catch (e) {
    console.error(`Could not load ALSVID cloud configuration (${e.message}); secret values were not logged.`);
    process.exitCode = 1;
  }
}

module.exports = { loadRuntimeEnvironment, resolveGcloudPath, describeSecretFailure, proxyEnvironment, REQUIRED };
