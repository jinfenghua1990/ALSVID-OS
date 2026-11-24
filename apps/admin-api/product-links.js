'use strict';

// 产品级第三方链接：从产品详情一键打开工厂 / 供应商的产品资料页。
// 数据落在云库 products.specs._externalLinks（复用主档，不新增表、不改产品版本与 SKU 业务字段）。
// 网址支持占位符，访问时由前端按当前产品替换，保证「对应产品」精准跳转。
const MAX_LINKS = 10;
const PLACEHOLDERS = ['model', 'name', 'sku', 'id'];

function normalizeLinks(input) {
  if (!Array.isArray(input)) throw new Error('第三方链接格式无效');
  if (input.length > MAX_LINKS) throw new Error(`最多配置 ${MAX_LINKS} 个第三方链接`);
  return input.map((item, index) => {
    const label = String(item?.label || '').trim().slice(0, 40);
    const url = String(item?.url || '').trim();
    const note = String(item?.note || '').trim().slice(0, 120);
    if (!label) throw new Error(`第 ${index + 1} 条链接请填写名称`);
    if (!url) throw new Error(`第 ${index + 1} 条链接请填写网址`);
    if (url.length > 1000 || !/^https?:\/\/[^\s]+$/i.test(url)) throw new Error(`第 ${index + 1} 条链接网址无效，仅支持 http/https`);
    const unknown = [...url.matchAll(/\{([A-Za-z]+)\}/g)].map(match => match[1]).find(key => !PLACEHOLDERS.includes(key));
    if (unknown) throw new Error(`第 ${index + 1} 条链接含未知占位符 {${unknown}}，可用：${PLACEHOLDERS.map(key => `{${key}}`).join('、')}`);
    return { label, url, note };
  });
}

function registerProductLinkRoutes(app, pgProducts) {
  app.get('/api/products/:id/external-links', async (req, reply) => {
    if (!pgProducts) return reply.code(503).send({ error: '第三方链接需要数据库存储' });
    try {
      const links = await pgProducts.getExternalLinks(req.params.id);
      return links === null ? reply.code(404).send({ error: '产品不存在' }) : reply.send({ links });
    } catch (_) {
      return reply.code(500).send({ error: '第三方链接读取失败' });
    }
  });

  app.put('/api/products/:id/external-links', async (req, reply) => {
    if (req.user?.role !== 'admin') return reply.code(403).send({ error: '仅管理员可配置第三方链接' });
    if (!pgProducts) return reply.code(503).send({ error: '第三方链接需要数据库存储' });
    let links;
    try { links = normalizeLinks(req.body?.links); }
    catch (e) { return reply.code(400).send({ error: /[\u4e00-\u9fa5]/.test(e.message || '') ? e.message : '第三方链接格式无效' }); }
    try {
      const saved = await pgProducts.setExternalLinks(req.params.id, links);
      return reply.send({ links: saved });
    } catch (e) {
      if (e.message === '产品不存在') return reply.code(404).send({ error: e.message });
      console.error(JSON.stringify({ level: 'error', code: 'EXTERNAL_LINKS_SAVE_FAILED', message: String(e.message || '').slice(0, 300) }));
      return reply.code(500).send({ error: '第三方链接保存失败' });
    }
  });
}

module.exports = { normalizeLinks, registerProductLinkRoutes, PLACEHOLDERS, MAX_LINKS };
