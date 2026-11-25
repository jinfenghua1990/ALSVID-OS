// 统一的连接池工厂。
// 目的：把 search_path 在"连接交出去之前"设置完，避免 SET 与第一条业务查询并发执行
// （旧写法 pool.on('connect', c => c.query(...)) 发起即返回，pg 会警告
//  "Calling client.query() when the client is already executing a query"，pg 9 将直接报错）。
// 说明：云库（Neon 连接池）拒绝连接串级 options=-c search_path=...，所以只能在会话内 SET。
// 注意：Neon 事务级 pooler 不保证同一物理连接的会话状态长期保留，
// 早先「SET 一次即可」的 WeakSet 缓存会偶发 42P01 relation does not exist，
// 因此每次交出连接前都重新 SET（多一次往返，换取确定性）。
const { Pool } = require('pg');

const SHARED_DATABASE_NAME = 'ALSVID Production';
const SHARED_DATABASE_HOSTS = new Set([
  'ep-shy-truth-b9laycln.c-7.eu-central-1.aws.neon.tech',
  'ep-shy-truth-b9laycln-pooler.c-7.eu-central-1.aws.neon.tech',
]);

function assertSharedCloudDatabase(connectionString) {
  if (typeof connectionString !== 'string' || !connectionString.trim()) {
    throw new Error('DATABASE_URL must point to the shared cloud PostgreSQL database.');
  }

  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('DATABASE_URL must be a PostgreSQL URL for the shared cloud database.');
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL must use PostgreSQL for the shared cloud database.');
  }

  let hostname = url.hostname.toLowerCase();
  if (hostname.startsWith('[') && hostname.endsWith(']')) hostname = hostname.slice(1, -1);
  const isLoopback = hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname === 'localhost.localdomain'
    || hostname === '0.0.0.0'
    || hostname === '::'
    || hostname === '::1'
    || /^127(?:\.\d{1,3}){3}$/.test(hostname)
    || /^::ffff:127(?:\.\d{1,3}){3}$/.test(hostname);

  if (!hostname || isLoopback) {
    throw new Error('Local databases are not allowed; configure the shared cloud PostgreSQL database.');
  }

  let databaseName;
  try {
    databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  } catch {
    throw new Error('DATABASE_URL must point to the shared ALSVID Production database.');
  }
  if (!SHARED_DATABASE_HOSTS.has(hostname) || databaseName !== SHARED_DATABASE_NAME) {
    throw new Error('Only the shared Neon ALSVID Production database is allowed.');
  }
}

function assertApplicationDatabase(connectionString) {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (process.env.ALSVID_TEST_MODE === '1') {
    if (!testUrl || connectionString !== testUrl) throw new Error('Test mode requires the explicit isolated TEST_DATABASE_URL; refusing database fallback.');
    let url;
    try { url = new URL(connectionString); } catch { throw new Error('TEST_DATABASE_URL must be a PostgreSQL URL for an isolated Neon test database.'); }
    const hostname = url.hostname.toLowerCase();
    const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || !hostname.endsWith('.neon.tech')
      || SHARED_DATABASE_HOSTS.has(hostname)
      || !databaseName) {
      throw new Error('TEST_DATABASE_URL must point to an isolated Neon database, never ALSVID Production or a local database.');
    }
    return;
  }
  assertSharedCloudDatabase(connectionString);
}

const SCHEMA = 'alsvid_v2';

function createPool(connectionString, options = {}) {
  assertApplicationDatabase(connectionString);
  // Neon 事务级 pooler（-pooler 主机）不保证同一物理连接的会话状态：
  // SET search_path 在 A 连接执行，下一条查询可能被路由到 B 连接，
  // 偶发 42P01（app_sessions / production_orders does not exist），前端表现为「服务暂时不可用」。
  // 直连计算节点（去掉 -pooler）没有这个问题，内部系统低并发完全够用。
  // 连接串允许 -pooler，但实际建池一律走 direct。
  const directUrl = String(connectionString).replace('-pooler.', '.');
  // 云端库在 eu-central-1：建一条新 TLS 连接约 2s，热查询只有约 0.35s。
  // node-postgres 默认 idleTimeoutMillis=10s，闲置 10 秒就把连接扔掉，
  // 于是「点一下菜单 → 重新握手 2s」反复发生，页面看起来像卡死。
  // 这里把闲置回收放宽到 5 分钟并开 TCP keepalive，让绝大多数请求走热连接。
  const pool = new Pool({
    connectionString: directUrl,
    idleTimeoutMillis: 300000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    ...options,
  });
  const rawConnect = pool.connect.bind(pool);
  const rawQuery = pool.query.bind(pool);

  /**
   * 跨境链路上空闲连接会被中间设备悄悄掐断，池中取出来的 client 看着正常，
   * 第一条 SET search_path 才抛 ECONNRESET / Connection terminated。
   * 以前这里直接 release(error) + throw，前端就收到一次 500「服务暂时不可用」。
   * 现在对「连接级」错误自动换新连接重试一次；SQL 逻辑错误（42P01/23505 等）绝不重试，
   * 否则会把真正的数据问题掩盖成偶发抖动。
   */
  const isConnectionError = (error) => {
    const code = String(error?.code || '');
    if (['ECONNRESET', 'ECONNREFUSED', 'ECONNEND', 'EPIPE', 'ETIMEDOUT', '08003', '08006', '57P01'].includes(code)) return true;
    const message = String(error?.message || '');
    return /ECONNRESET|Connection terminated unexpectedly|Client has encountered a connection error|socket hang up/i.test(message);
  };

  // 每次交出连接前都重新设置 search_path，避免 pooler 复用连接时会话状态丢失
  pool.connect = async function connectWithSchema() {
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let client;
      try {
        client = await rawConnect();
        await client.query('SET search_path TO ' + SCHEMA);
        return client;
      } catch (error) {
        lastError = error;
        if (client) client.release(error);
        if (attempt === 0 && isConnectionError(error)) {
          console.error(JSON.stringify({ level: 'warn', code: 'PG_RECONNECT_ONCE', message: String(error?.message || '').slice(0, 120) }));
          continue; // 换一条新连接再试一次
        }
        throw error;
      }
    }
    throw lastError;
  };

  // 闲置连接被服务端或中间网络掐断时，pg 会在 Pool 上抛 'error' 事件。
  // 没有监听器时 EventEmitter 会直接抛出未捕获异常把进程带走，
  // 而现在连接会存活 5 分钟，撞上的概率比默认 10s 高得多，必须兜住。
  pool.on('error', (error) => {
    console.error(JSON.stringify({ level: 'error', code: 'PG_POOL_IDLE_ERROR', message: String(error?.message || '').slice(0, 200) }));
  });

  // 单条查询也必须走上面的 connect()，否则会绕过 search_path
  pool.query = function queryWithSchema(...args) {
    if (typeof args[args.length - 1] === 'function') return rawQuery(...args); // 回调式调用保持原样（当前无使用者）
    return (async () => {
      const client = await pool.connect();
      try {
        return await client.query(...args);
      } finally {
        client.release();
      }
    })();
  };

  /**
   * 一次往返跑多条「不带参数」的查询（内部用简单查询协议的多语句）。
   *
   * 为什么需要它：跨境链路每次往返 0.2–1s，而一条连接每次都要先 SET search_path（又一次往返）。
   * 页面聚合接口常要并发跑十几条互不相关的 SELECT，走 Promise.all 仍是
   * 「N 条 × (取连接 + SET + 查询)」，在池子上限只有 3 的情况下要排队好几轮。
   * 合并成一条消息后，总共只花「1 次 SET + 1 次查询」。
   *
   * 约束：语句里不能带 SQL 参数（简单协议不支持），也不能有分号分隔的多余语句。
   * 返回与入参等长的数组，每项是 { rows, rowCount }，与原 pool.query 的返回结构兼容。
   */
  pool.queryMany = async function queryMany(statements) {
    if (!Array.isArray(statements) || statements.length === 0) return [];
    if (statements.length === 1) return [await pool.query(statements[0])];
    const client = await pool.connect();
    try {
      // 简单查询协议下 pg 按顺序返回每个语句的结果
      const result = await client.query(statements.map((sql) => String(sql).trim().replace(/;+$/, '')).join(';\n'));
      const list = Array.isArray(result) ? result : [result];
      if (list.length !== statements.length) {
        throw new Error(`queryMany 结果数量不匹配：期望 ${statements.length}，实到 ${list.length}`);
      }
      return list;
    } finally {
      client.release();
    }
  };

  return pool;
}

module.exports = { createPool, SCHEMA, assertSharedCloudDatabase, assertApplicationDatabase };
