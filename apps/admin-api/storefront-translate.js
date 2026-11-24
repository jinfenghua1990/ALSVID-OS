'use strict';
// 装修文案的自动翻译（服务端）。
//
// 为什么放在服务端：翻译要调外部引擎，密钥只能留在服务端；后台页面是浏览器，
// 把 key 放进前端等于公开。
//
// 三条不可动摇的规则：
// 1. **只补空缺，绝不覆盖已有译文。** 人工校对过的条目被机翻冲掉一次，这个功能
//    就再也没人敢用了。是否「已有」由调用方传入的 existing 决定，本模块不猜。
// 2. **品牌词/型号先换成占位符再送翻，回来还原。** 否则 ALSVID、A1 Ultra、L1 PRO
//    会被译成各种奇怪的东西。还原失败（占位符丢了）时宁可判这条失败，也不输出
//    一条残缺的译文。
// 3. **失败不阻塞。** 某一批超时或报错只记入 failed，其他批次照常返回；调用方
//    拿到的是「能翻的翻了」而不是一个异常。
//
// 引擎通过 TRANSLATE_PROVIDER 切换，业务代码不感知具体厂商。

const TARGET_LABELS = { en: 'EN-US', de: 'DE' };
const LAYOUT_TARGETS = ['en', 'de'];

// 品牌与型号：这些词在任何语言下都不该被翻译。
// 注意不要放 Faltrad / E-Bike 这类普通名词——它们在德语里本来就该有对应写法。
const GLOSSARY = [
  'ALSVID',
  'A1 Ultra', 'A1 Carbon', 'A1',
  'L1 PRO', 'L1 Carbon', 'L1',
];

const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_BATCH_SIZE = 40;

function providerName() {
  return String(process.env.TRANSLATE_PROVIDER || 'mock').trim().toLowerCase();
}

function timeoutMs() {
  const value = Number(process.env.TRANSLATE_TIMEOUT_MS);
  return Number.isFinite(value) && value > 500 ? value : DEFAULT_TIMEOUT_MS;
}

function batchSize() {
  const value = Number(process.env.TRANSLATE_BATCH_SIZE);
  return Number.isSafeInteger(value) && value > 0 && value <= 100 ? value : DEFAULT_BATCH_SIZE;
}

// ── 占位符保护 ────────────────────────────────────────────────────────────
// 用 ⟦n⟧ 这种不参与正常文本的记号。多数引擎会原样保留；万一被拆散，
// restore 时占位符对不上，就判这条失败而不是交出一条缺词的译文。
// terms 由调用方传入（代码里的品牌词 + 数据库术语库），长词优先替换，
// 否则 'A1' 会先吃掉 'A1 Ultra' 的前半段。
function protectTerms(text, terms) {
  const tokens = [];
  let out = String(text);
  const sorted = [...(terms && terms.length ? terms : GLOSSARY)].sort((a, b) => b.length - a.length);
  for (const term of sorted) {
    const pattern = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    out = out.replace(pattern, () => {
      const index = tokens.length;
      tokens.push(term);
      return `⟦${index}⟧`;
    });
  }
  return { text: out, tokens };
}

function restoreTerms(text, tokens) {
  let out = String(text);
  for (let i = 0; i < tokens.length; i += 1) {
    const token = `⟦${i}⟧`;
    if (!out.includes(token)) return null; // 占位符丢了，这条译文不可信
    out = out.split(token).join(tokens[i]);
  }
  // 还有残留的 ⟦n⟧ 说明引擎自己造了占位符，同样不可信
  if (/⟦\d+⟧/.test(out)) return null;
  return out;
}

// ── 引擎实现 ──────────────────────────────────────────────────────────────
// 统一签名：(texts: string[], target: 'en'|'de') => Promise<string[]>
// 返回数组必须与入参等长、同序；抛错表示整批失败。

// 占位引擎：不调用任何外部服务，产出「[DE] 原文」这种一眼可辨的形式。
// 它只用来验证链路（接口、批量、占位符、落库、渲染是否都通），
// 默认不会自动写入线上——前端在 provider=mock 时会要求人工确认。
async function translateWithMock(texts, target) {
  const tag = String(target).toUpperCase();
  return texts.map((text) => `[${tag}] ${text}`);
}

// DeepL：德语质量最稳，支持一次提交多段。免费版 key 以 :fx 结尾，走 api-free。
async function translateWithDeepL(texts, target) {
  const key = String(process.env.DEEPL_API_KEY || '').trim();
  if (!key) throw new Error('未配置 DEEPL_API_KEY');
  const endpoint = key.endsWith(':fx') ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate';
  const body = new URLSearchParams();
  body.set('source_lang', 'ZH');
  body.set('target_lang', TARGET_LABELS[target] || String(target).toUpperCase());
  body.set('preserve_formatting', '1');
  for (const text of texts) body.append('text', text);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`DeepL 返回 ${response.status}：${detail.slice(0, 160)}`);
    }
    const payload = await response.json();
    const list = Array.isArray(payload?.translations) ? payload.translations : [];
    if (list.length !== texts.length) throw new Error(`DeepL 返回条数不匹配（期望 ${texts.length}，实到 ${list.length}）`);
    return list.map((item) => String(item?.text ?? ''));
  } finally {
    clearTimeout(timer);
  }
}

// OpenAI 兼容接口：语气更自然，适合营销文案。要求模型按顺序返回 JSON 数组。
async function translateWithOpenAI(texts, target) {
  const key = String(process.env.OPENAI_API_KEY || '').trim();
  if (!key) throw new Error('未配置 OPENAI_API_KEY');
  const base = String(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').trim().replace(/\/+$/, '');
  const model = String(process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();
  const langName = target === 'de' ? 'German' : 'English';

  const system = [
    `You translate Chinese e-commerce storefront copy into ${langName}.`,
    'Rules:',
    '- Translate meaning and marketing tone, not word by word.',
    `- Keep every ⟦n⟧ placeholder exactly as-is, in place. Never translate or renumber them.`,
    '- Keep numbers, units, prices and punctuation style natural for the target language.',
    '- Return ONLY a JSON array of strings, same length and order as the input array. No prose, no code fence.',
  ].join('\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify(texts) },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`OpenAI 返回 ${response.status}：${detail.slice(0, 160)}`);
    }
    const payload = await response.json();
    const content = String(payload?.choices?.[0]?.message?.content || '').trim();
    const json = content.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    let list;
    try { list = JSON.parse(json); } catch { throw new Error('模型返回的不是合法 JSON'); }
    if (!Array.isArray(list) || list.length !== texts.length) {
      throw new Error(`模型返回条数不匹配（期望 ${texts.length}，实到 ${Array.isArray(list) ? list.length : '非数组'}）`);
    }
    return list.map((item) => String(item ?? ''));
  } finally {
    clearTimeout(timer);
  }
}

const PROVIDERS = { mock: translateWithMock, deepl: translateWithDeepL, openai: translateWithOpenAI };

function resolveProvider() {
  const name = providerName();
  const impl = PROVIDERS[name];
  if (!impl) throw new Error(`不支持的翻译引擎：${name}（可选 ${Object.keys(PROVIDERS).join(' / ')}）`);
  return { name, impl };
}

/** 当前引擎状态，供后台显示「是否已接入真实引擎」。绝不回显密钥。 */
function translateStatus() {
  const name = providerName();
  const known = Boolean(PROVIDERS[name]);
  const ready = name === 'deepl' ? Boolean(String(process.env.DEEPL_API_KEY || '').trim())
    : name === 'openai' ? Boolean(String(process.env.OPENAI_API_KEY || '').trim())
    : true;
  return {
    provider: name,
    known,
    ready,
    // mock 产物是一眼可辨的占位文本，不能当成正式译文自动上线
    placeholder: name === 'mock',
    batchSize: batchSize(),
    timeoutMs: timeoutMs(),
  };
}

/**
 * 补齐缺失译文。
 * @param {string[]} strings 中文原文清单（已去重）
 * @param {string[]} targets 目标语言，交集 LAYOUT_TARGETS
 * @param {object} existing 现有译文 {en:{中文:译文}, de:{...}}，其中的键一律视为「已有人工结果」，不覆盖
 * @param {{protect?:string[], prefer?:object}} [glossary] 术语库：protect=不许翻译的串，prefer={en:{中文:固定译法}}
 * @param {{lookup?:Function, save?:Function}} [memory] 翻译记忆适配器，命中就不再调引擎
 * @returns {{provider:string, translations:object, stats:object}}
 */
async function translateLayoutStrings({ strings, targets, existing, glossary, memory }) {
  const list = Array.isArray(strings)
    ? [...new Set(strings.map((s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim()).filter(Boolean))]
    : [];
  if (!list.length) return { provider: providerName(), translations: {}, stats: { requested: 0, filled: 0, skipped: 0, reused: 0, preferred: 0, failed: 0, batches: 0 } };

  const wanted = (Array.isArray(targets) ? targets : LAYOUT_TARGETS).filter((code) => LAYOUT_TARGETS.includes(code));
  if (!wanted.length) throw new Error('没有可翻译的目标语言');

  const { name, impl } = resolveProvider();
  const translations = {};
  const stats = { requested: list.length, filled: 0, skipped: 0, reused: 0, preferred: 0, failed: 0, batches: 0, errors: [] };
  for (const code of wanted) translations[code] = {};

  // 翻译记忆：先查再翻。跨区数据库慢，查一次拿全语言，不要按语言循环查。
  let remembered = { en: {}, de: {} };
  if (memory && typeof memory.lookup === 'function') {
    try { remembered = (await memory.lookup(list, wanted)) || remembered; }
    catch (error) { stats.errors.push(`memory: ${String(error?.message || error).slice(0, 160)}`); }
  }
  const protect = [...GLOSSARY, ...((glossary && Array.isArray(glossary.protect)) ? glossary.protect : [])];
  const prefer = (glossary && glossary.prefer) || {};
  const learned = []; // 本次新产出的译文，最后一次性写回记忆

  for (const target of wanted) {
    const human = existing && typeof existing[target] === 'object' && existing[target] ? existing[target] : {};
    // 人工结果优先于记忆：记忆里可能是旧的机翻，人工改过的不该被它盖回去
    const already = { ...(remembered[target] || {}), ...human };
    // 只补缺：已有非空译文的一律跳过，哪怕它只是机翻——覆盖与否由人在翻译面板决定
    const pending = [];
    for (const text of list) {
      const value = String(already[text] || '').trim();
      if (value) {
        if (!String(human[text] || '').trim() && remembered[target] && remembered[target][text]) {
          // 记忆命中：直接复用，不花引擎调用
          translations[target][text] = value;
          stats.reused += 1;
        } else {
          stats.skipped += 1;
        }
        continue;
      }
      // 术语库固定译法：命中就不再送引擎，保证「折叠车」永远是同一个词
      const fixed = prefer[target] && prefer[target][text];
      if (fixed) { translations[target][text] = fixed; stats.preferred += 1; continue; }
      pending.push(text);
    }
    if (!pending.length) continue;

    const protectedList = pending.map((text) => protectTerms(text, protect));
    for (let offset = 0; offset < protectedList.length; offset += batchSize()) {
      const slice = protectedList.slice(offset, offset + batchSize());
      stats.batches += 1;
      let output;
      try {
        output = await impl(slice.map((item) => item.text), target);
      } catch (error) {
        stats.failed += slice.length;
        stats.errors.push(`${target}: ${String(error?.message || error).slice(0, 160)}`);
        continue; // 单批失败不影响其他批次
      }
      for (let i = 0; i < slice.length; i += 1) {
        const source = pending[offset + i];
        const restored = restoreTerms(output[i], slice[i].tokens);
        const value = typeof restored === 'string' ? restored.trim() : '';
        // 空译文或占位符丢失：判失败，宁可留中文让人看见，也不写入残缺译文
        if (!value) { stats.failed += 1; continue; }
        translations[target][source] = value;
        stats.filled += 1;
        learned.push({ source, locale: target, target: value, engine: name });
      }
    }
  }

  // 写回记忆：失败不影响已拿到的译文
  if (learned.length && memory && typeof memory.save === 'function') {
    try { await memory.save(learned); }
    catch (error) { stats.errors.push(`memory-save: ${String(error?.message || error).slice(0, 160)}`); }
  }

  return { provider: name, translations, stats };
}

module.exports = { translateLayoutStrings, translateStatus, LAYOUT_TARGETS, GLOSSARY };
