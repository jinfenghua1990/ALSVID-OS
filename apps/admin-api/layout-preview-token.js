'use strict';
// 装修草稿预览令牌。
//
// 为什么需要它：8091 独立站的 Draft Mode 预览要在服务端读 8089 的草稿，
// 但 8091 的服务端没有 8089 的管理员会话（Cookie 属于 8089 域，跨站带不过去）。
// 8089 的 GET /api/site/layout?draft=1 只认 admin session，直接放开等于把未发布内容公开。
//
// 方案：由 8089 后台签发一枚短时效、绑定语言的 HMAC 令牌，8091 只做透传，
// 不持有任何密钥；8089 用同一密钥验签。无状态、无需查库、天然防重放（短过期 + 随机 nonce）。
const { createHmac, timingSafeEqual, randomBytes } = require('node:crypto');

// 默认 15 分钟：足够完成一次预览，泄露窗口又足够小。
const DEFAULT_TTL_SECONDS = 15 * 60;
const MAX_TTL_SECONDS = 60 * 60;
const LOCALES = new Set(['zh', 'en', 'de']);

const secret = () => String(process.env.ALSVID_PREVIEW_SECRET || '').trim();

function configured() {
  // 太短的密钥等于没有：低于 32 字节直接视为未配置，避免弱密钥上线。
  return Buffer.byteLength(secret(), 'utf8') >= 32;
}

function base64url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function sign(payloadB64) {
  return base64url(createHmac('sha256', secret()).update(payloadB64).digest());
}

/**
 * 签发预览令牌。调用方必须已完成管理员鉴权（见 catalog.js 路由）。
 * @returns {{token: string, expiresAt: string, locale: string} | null} 未配置密钥时返回 null
 */
function signPreviewToken({ locale = 'zh', ttlSeconds = DEFAULT_TTL_SECONDS } = {}) {
  if (!configured()) return null;
  const lang = LOCALES.has(locale) ? locale : 'zh';
  const ttl = Math.min(Math.max(Number(ttlSeconds) || DEFAULT_TTL_SECONDS, 60), MAX_TTL_SECONDS);
  const exp = Date.now() + ttl * 1000;
  const payload = { v: 1, role: 'admin', locale: lang, exp, jti: randomBytes(8).toString('hex') };
  const payloadB64 = base64url(JSON.stringify(payload));
  return { token: `${payloadB64}.${sign(payloadB64)}`, expiresAt: new Date(exp).toISOString(), locale: lang };
}

/**
 * 校验预览令牌。任何异常一律判否，不区分「格式错」与「签名错」，避免给攻击者提供信号。
 * @returns {{ok: true, locale: string} | {ok: false, reason: string}}
 */
function verifyPreviewToken(token) {
  if (!configured()) return { ok: false, reason: '预览功能未配置（缺少 ALSVID_PREVIEW_SECRET）' };
  if (typeof token !== 'string' || token.length > 2048) return { ok: false, reason: '预览链接无效' };
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reason: '预览链接无效' };
  const [payloadB64, signature] = parts;
  const expected = sign(payloadB64);
  const a = Buffer.from(String(signature), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // 长度不同直接判否：timingSafeEqual 要求等长，长度本身不是秘密
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: '预览链接无效' };
  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: '预览链接无效' };
  }
  if (!payload || payload.v !== 1 || payload.role !== 'admin') return { ok: false, reason: '预览链接无效' };
  if (!Number.isFinite(payload.exp) || Date.now() > payload.exp) return { ok: false, reason: '预览链接已过期，请回到后台重新生成' };
  if (!LOCALES.has(payload.locale)) return { ok: false, reason: '预览链接无效' };
  return { ok: true, locale: payload.locale };
}

module.exports = { signPreviewToken, verifyPreviewToken, configured };
