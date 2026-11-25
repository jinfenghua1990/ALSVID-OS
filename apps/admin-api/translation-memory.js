'use strict';
// 术语库与翻译记忆的存取层。
//
// 为什么单独一层：storefront-translate.js 是纯函数（只依赖注入进来的数据），
// 这样才能在没有数据库的情况下单测引擎、占位符、分批逻辑。DB 相关的东西全部
// 收在这里，由 catalog.js 组装后注入。
//
// 两条纪律：
// 1. **记忆命中不覆盖人工结果。** 人工在面板里改过的译文会以 engine='manual'
//    写回记忆；查询时按 updated_at 取最新一条，所以人工改写天然优先。
// 2. **术语库坏了不能拖垮翻译。** 表不存在（迁移没跑）时返回空规则，
//    退化成「只有代码里的品牌词保护」，而不是整个接口 500。

const crypto = require('node:crypto');

const LOCALES = ['en', 'de'];

/** 原文归一化 + 哈希。归一化必须与 storefront-translate 里的口径一致。 */
function normalize(text) {
  return String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
}
function hashOf(text) {
  return crypto.createHash('sha256').update(normalize(text), 'utf8').digest('hex').slice(0, 32);
}

/**
 * 读取术语库。
 * @returns {{protect:string[], prefer:Object<string,Object<string,string>>}}
 *   protect: 任何语言都不翻译的字面串（按长度倒序，长词优先匹配）
 *   prefer:  {en:{中文:固定译法}, de:{...}}
 */
async function loadGlossary(client) {
  try {
    const rows = (await client.query(
      "SELECT term, locale, kind, translation FROM translation_glossary WHERE kind IN ('protect','prefer')"
    )).rows;
    const protect = [];
    const prefer = { en: {}, de: {} };
    for (const row of rows) {
      const term = normalize(row.term);
      if (!term) continue;
      if (row.kind === 'protect') { protect.push(term); continue; }
      const translation = normalize(row.translation);
      if (!translation || !LOCALES.includes(row.locale)) continue;
      prefer[row.locale][term] = translation;
    }
    protect.sort((a, b) => b.length - a.length);
    return { protect, prefer };
  } catch (error) {
    if (error?.code === '42P01') return { protect: [], prefer: { en: {}, de: {} } };
    throw error;
  }
}

/**
 * 批量查翻译记忆。
 * @returns {Object<string, Object<string,string>>} {en:{原文:译文}, de:{...}}
 *   只返回命中的，没命中就不出现在结果里（与 existing 的语义一致）。
 */
async function lookupMemory(client, texts, targets) {
  const out = { en: {}, de: {} };
  const list = (Array.isArray(texts) ? texts : []).map(normalize).filter(Boolean);
  const wanted = (Array.isArray(targets) ? targets : LOCALES).filter((code) => LOCALES.includes(code));
  if (!list.length || !wanted.length) return out;
  // 去重后按哈希查，避免把整段原文塞进 IN 条件（原文可能很长）
  const byHash = new Map();
  for (const text of list) byHash.set(hashOf(text), text);
  try {
    const rows = (await client.query(
      'SELECT source_hash, locale, target_text FROM translation_memory WHERE source_hash = ANY($1::text[]) AND locale = ANY($2::text[])',
      [[...byHash.keys()], wanted]
    )).rows;
    for (const row of rows) {
      const source = byHash.get(row.source_hash);
      const target = normalize(row.target_text);
      if (!source || !target || !out[row.locale]) continue;
      out[row.locale][source] = target;
    }
    // 命中计数单独一次批量更新：不参与事务成败，失败只记日志
    const hits = rows.map((row) => row.source_hash);
    if (hits.length) {
      await client.query('UPDATE translation_memory SET hits = hits + 1 WHERE source_hash = ANY($1::text[]) AND locale = ANY($2::text[])', [hits, wanted]).catch(() => {});
    }
    return out;
  } catch (error) {
    if (error?.code === '42P01') return out;
    throw error;
  }
}

/**
 * 把新译文写回记忆。同一 (原文, 语言) 只保留一条，后来的覆盖先前的：
 * 机翻先写、人工再改时，人工结果自然成为最新版本。
 */
async function saveMemory(client, entries) {
  const rows = (Array.isArray(entries) ? entries : []).filter((item) => item && LOCALES.includes(item.locale) && normalize(item.target));
  if (!rows.length) return 0;
  const unique=new Map();
  for(const item of rows){const entry=[hashOf(item.source),normalize(item.source),item.locale,normalize(item.target),item.engine||null];const key=entry[0]+':'+entry[2];if(unique.get(key)?.[4]!=='manual'||entry[4]==='manual')unique.set(key,entry);}
  const payload=[...unique.values()];
  try {
    const result=await client.query(
      `INSERT INTO translation_memory(source_hash, source_text, locale, target_text, engine)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[])
       ON CONFLICT (source_hash, locale) DO UPDATE SET
         target_text = EXCLUDED.target_text,
         engine = EXCLUDED.engine,
         updated_at = now()
       WHERE translation_memory.engine IS DISTINCT FROM 'manual' OR EXCLUDED.engine='manual'`,
      [payload.map((r) => r[0]), payload.map((r) => r[1]), payload.map((r) => r[2]), payload.map((r) => r[3]), payload.map((r) => r[4])]
    );
    return result.rowCount ?? payload.length;
  } catch (error) {
    // 记忆写失败不影响译文本身已经拿到的结果
    if (error?.code === '42P01') return 0;
    console.error(JSON.stringify({ level: 'warn', code: 'TRANSLATION_MEMORY_SAVE_FAILED', message: String(error?.message || '').slice(0, 200) }));
    return 0;
  }
}

/** 术语库现状，供后台展示与排查 */
async function glossarySummary(client) {
  try {
    const rows = (await client.query('SELECT kind, locale, count(*)::int AS count FROM translation_glossary GROUP BY kind, locale')).rows;
    const memory = (await client.query('SELECT locale, count(*)::int AS count FROM translation_memory GROUP BY locale')).rows;
    return {
      available: true,
      protect: rows.filter((r) => r.kind === 'protect').reduce((sum, r) => sum + r.count, 0),
      prefer: rows.filter((r) => r.kind === 'prefer').reduce((sum, r) => sum + r.count, 0),
      memory: { en: memory.find((r) => r.locale === 'en')?.count || 0, de: memory.find((r) => r.locale === 'de')?.count || 0 },
    };
  } catch (error) {
    if (error?.code === '42P01') return { available: false, protect: 0, prefer: 0, memory: { en: 0, de: 0 } };
    throw error;
  }
}

module.exports = { loadGlossary, lookupMemory, saveMemory, glossarySummary, normalize, hashOf, LOCALES };
