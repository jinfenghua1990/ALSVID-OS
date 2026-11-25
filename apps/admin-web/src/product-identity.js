// 商品对运营的唯一可读标识 = 产品主档里的 SEO 商品 ID（= 商城地址 slug = 各渠道商品链接）。
// 内部 UUID（p-bfaf74b1-… / 01a1cfb5-…）只用于接口调用，不该出现在面向运营的列表里。
// 配件类产品目前还没定 SEO 商品 ID，这里返回空串：调用方自己决定显示「未设置」还是回落内部 ID，
// 不要在这里编造一个看起来像 ID 的值。
export function seoProductIdOf(product) {
  return String(product?.specs?._seoProductId || '').trim().toLowerCase();
}
