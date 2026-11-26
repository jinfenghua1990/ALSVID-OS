'use strict';
const { createHmac, timingSafeEqual, randomBytes } = require('node:crypto');

const locales = ['zh', 'en', 'de'];
const devices = ['desktop', 'mobile'];
const slots = locales.flatMap(locale => devices.map(device => ({ locale, device })));
const secret = () => String(process.env.ALSVID_PREVIEW_SECRET || '').trim();
function fail(message, statusCode = 409) { throw Object.assign(new Error(message), { statusCode }); }
function signature(body) {
  if (Buffer.byteLength(secret()) < 32) fail('预览密钥尚未配置', 503);
  return createHmac('sha256', secret()).update('product-template-review:' + body).digest('base64url');
}
function sign(value) {
  const body = Buffer.from(JSON.stringify(value)).toString('base64url');
  return body + '.' + signature(body);
}
function verify(token, type) {
  if (typeof token !== 'string' || token.length > 4096) fail('预览凭证无效');
  const parts = token.split('.');
  if (parts.length !== 2) fail('预览凭证无效');
  const [body, sig] = parts, a = Buffer.from(sig), b = Buffer.from(signature(body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) fail('预览凭证无效');
  let value;
  try { value = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch (_) { fail('预览凭证无效'); }
  if (value?.type !== type || !Number.isSafeInteger(value.exp) || Date.now() >= value.exp) fail('预览凭证失效，请重新检查');
  return value;
}
function scope(page, actor, context = {}) {
  if (!page || page.pageType !== 'product_template' || page.path !== '/products' || !locales.includes(page.locale) || !page.draft || !Number.isSafeInteger(page.revision) || !actor) fail('该商品模板没有可发布的草稿');
  const previewScope = context.previewScope;
  const productId = context.productId == null ? '' : String(context.productId);
  if (!['listing', 'product'].includes(previewScope) || (previewScope === 'product' && (!productId || productId.length > 160))) fail('商品模板预览范围无效');
  return { id: String(page.id), path: page.path, revision: page.revision, sourceLocale: page.locale, actor: String(actor), previewScope, productId };
}
function same(a, b) { return ['id', 'path', 'revision', 'sourceLocale', 'actor', 'previewScope', 'productId'].every(key => a[key] === b[key]); }
function start(page, actor, context) {
  const target = scope(page, actor, context), session = randomBytes(16).toString('hex'), exp = Date.now() + 30 * 60 * 1000;
  return { session, revision: target.revision, slots: slots.map(slot => {
    const draft = slot.locale === target.sourceLocale;
    return { ...slot, draft, token: sign({ ...target, ...slot, draft, session, exp, type: 'preview' }) };
  }) };
}
function read(token) {
  const value = verify(token, 'preview');
  if (!slots.some(slot => slot.locale === value.locale && slot.device === value.device)) fail('预览类型无效');
  return value;
}
function rendered(ticket, page) {
  if (!same(ticket, scope(page, ticket.actor, ticket))) fail('草稿已修改，请重新开始预览');
  return sign({ ...ticket, type: 'rendered' });
}
function approve(page, actor, session, receipts, context) {
  const target = scope(page, actor, context);
  if (typeof session !== 'string' || !Array.isArray(receipts) || receipts.length !== 6) fail('必须确认全部六项预览');
  const seen = new Set();
  for (const token of receipts) {
    const receipt = verify(token, 'rendered');
    if (receipt.session !== session || !same(receipt, target) || !slots.some(slot => slot.locale === receipt.locale && slot.device === receipt.device)) fail('预览与当前草稿或账号不匹配');
    seen.add(receipt.locale + ':' + receipt.device);
  }
  if (seen.size !== 6) fail('必须确认六种不同预览');
  return { session, slots: [...seen] };
}
function requireReviewedRelease(page, actor, input = {}) {
  if (page.pageType !== 'product_template' || page.path !== '/products') return null;
  if (!actor) fail('商品模板必须通过六项发布预览，不能使用旧版直接发布');
  return approve(page, actor, input.session, input.receipts, { previewScope: input.previewScope, productId: input.productId });
}

module.exports = { start, read, rendered, approve, requireReviewedRelease };
