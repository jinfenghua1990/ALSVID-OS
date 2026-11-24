const { createPool } = require('./db-pool');
function createDealerApplicationArchive(url) {
  const pool = createPool(url, { max: 2 });
  return {
    async list(page) {
      const rows = (await pool.query(`SELECT source_id AS "sourceId",source_snapshot AS snapshot,captured_at AS "capturedAt"
        FROM dealer_application_source_archive ORDER BY source_snapshot->>'submitted_at' DESC,source_id DESC LIMIT 101 OFFSET $1`, [(page - 1) * 100])).rows;
      return { items: rows.slice(0, 100), hasMore: rows.length > 100 };
    },
    close: () => pool.end(),
  };
}
function registerDealerApplicationArchiveRoutes(app, store) {
  app.get('/api/dealer-application-sources', async (req, reply) => {
    if (req.user?.role !== 'admin') return reply.code(403).send({ error: '仅管理员可查看历史申请' });
    if (!store) return reply.code(503).send({ error: '历史申请暂不可用' });
    const page = Number(req.query?.page || 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000) return reply.code(400).send({ error: '页码无效' });
    try { return { data: await store.list(page) }; }
    catch (_) { return reply.code(503).send({ error: '历史申请暂不可用' }); }
  });
}
module.exports = { createDealerApplicationArchive, registerDealerApplicationArchiveRoutes };
