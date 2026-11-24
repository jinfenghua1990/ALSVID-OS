// 商城装修的多语言文本层
//
// 设计：中文稿是唯一编辑源；英/德不复制版式，只维护「内容 ID → 译文」的映射，
// 预览与发布时把同一份 HTML 里的文本替换掉，得到该语言的页面快照。
//
// ── 为什么用内容 ID，而不是「中文原文当 key」 ─────────────────────────────
// 早期实现是 translations = { en: { '免费配送': 'Free shipping' } }。这个写法有三个
// 结构性缺陷，全部会在真实运营中爆发：
//   1. 中文改一个字 → key 变了 → 译文「失联」，但旧译文还躺在库里变成垃圾。
//   2. 两处不同语境用了同一句中文（按钮「了解更多」和正文「了解更多」）→ 被迫共用
//      一条译文，必然有一处语境不对。
//   3. 没有「译文对应哪一版原文」的概念 → 无法实现「中文改了，译文标记为需要更新」。
//
// 现在改为结构性 ID：`<区块>.<标签>.<序号>`，属性再加 `@属性名`，例如
//   hero.h1.0           首屏主标题
//   hero.p.2            首屏第 3 个 p
//   hero.img.0@alt      首屏第 1 张图的 alt
//   image-text#2.h3.0   第二个图文区块的 h3（同类型区块用 #n 区分）
//
// ID 只依赖 DOM 结构、不依赖文案内容，所以：
//   · 改中文文案 → ID 不变 → 译文自动跟上，并可通过 src 比对发现「需要更新」
//   · 同一句中文出现在两处 → 两个 ID → 可以分别翻译，语境各自正确
//   · 复用同一条译文由「翻译记忆」按原文哈希兜底，不靠 ID 合并
//
// 注意：ID 是「渲染时按同一份 HTML 现算」的，不往 HTML 里写 data 属性。
// 好处是快照 HTML 保持干净、不用迁移；代价是区块顺序大改时块内序号会位移，
// 但影响局限在单个区块内，不会波及整页。

export const LAYOUT_LANGS = [['zh', '中文'], ['en', 'English'], ['de', 'Deutsch']];
export const BLOCK_LABELS = { hero: '主视觉横幅', 'product-grid': '商品展示区', 'image-text': '图文介绍', image: '单张图片', service: '服务保障', footer: '页脚信息', spacer: '留白间距' };
// 模板里还有几段没有 data-alsvid-block 的容器（导航、引导区、页脚），按 class 兜底命名
const CLASS_LABELS = {
  'alsvid-storefront': '页面主体',
  'storefront-nav': '顶部导航',
  intro: '引导介绍区',
  hero: '主视觉横幅',
  'model-grid': '商品展示区',
  editorial: '图文介绍',
  'service-row': '服务保障',
  'storefront-footer': '页脚',
};

const SKIP_TAGS = ['SCRIPT', 'STYLE', 'NOSCRIPT'];
// 只处理含文字的节点：纯数字、日期、箭头、编号（01 / 04）跳过
const TRANSLATABLE = /[\p{L}]/u;
// 属性里的文案同样是访客可感知的：alt 是图片替代文本（图片没加载或读屏时念出来），
// aria-label 会被读屏软件朗读。只翻文本节点会留下「德语页里读出中文」的隐患。
const TRANSLATABLE_ATTRS = ['alt', 'aria-label', 'title', 'placeholder'];

// 译文状态：中文源稿改动后，原译文不删除，只降级为 needs-update，等人确认。
export const TRANSLATION_STATUS = { ok: 'ok', needsUpdate: 'needs-update', missing: 'missing' };

function parseFragment(html) {
  return new DOMParser().parseFromString('<div id="alsvid-root">' + String(html || '') + '</div>', 'text/html');
}
function textNodesOf(root) {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node = walker.nextNode();
  while (node) { nodes.push(node); node = walker.nextNode(); }
  return nodes;
}
function elementsOf(root) {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  const nodes = [];
  let node = walker.nextNode();
  while (node) { nodes.push(node); node = walker.nextNode(); }
  return nodes;
}
function normalizeText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}
function translatable(text) {
  return Boolean(text) && TRANSLATABLE.test(text);
}
function translatableAttrsOf(element) {
  const out = [];
  for (const attr of TRANSLATABLE_ATTRS) {
    const text = normalizeText(element.getAttribute(attr));
    if (translatable(text)) out.push([attr, text]);
  }
  return out;
}

// ── 内容 ID 生成 ──────────────────────────────────────────────────────────
// 同一类型区块会出现多次（比如三个「图文介绍」），按文档顺序加 #n 区分，
// 否则不同区块的同位置元素会撞成同一个 ID，译文互相覆盖。
function blockIdsOf(root) {
  const map = new Map();
  const seen = new Map();
  for (const element of elementsOf(root)) {
    const key = element.getAttribute && element.getAttribute('data-alsvid-block');
    if (!key) continue;
    const name = String(key).trim() || 'block';
    const index = seen.get(name) || 0;
    seen.set(name, index + 1);
    map.set(element, index === 0 ? name : `${name}#${index + 1}`);
  }
  return map;
}
function blockIdOf(element, blocks, root) {
  let node = element;
  while (node && node !== root) {
    const hit = blocks.get(node);
    if (hit) return hit;
    node = node.parentElement;
  }
  return 'page';
}

/**
 * 遍历某个根节点，产出每个「可翻译单元」及其稳定 ID。
 * 这是整个翻译层的唯一真源：面板清单、覆盖率、渲染都从这里取，避免三处算法不一致。
 * 必须传「已经在当前 document 里」的根节点，否则改出来的节点不在要返回的文档里。
 * @returns {Array<{id:string, kind:'text'|'attr', attr?:string, text:string, node?:Node, element?:Element}>}
 */
function walkEntriesInRoot(root) {
  if (!root) return [];
  const blocks = blockIdsOf(root);
  const entries = [];
  const tagOrdinal = new Map(); // `${blockId}|${tag}` → 已出现的元素个数

  for (const element of elementsOf(root)) {
    if (element === root) continue;
    const tag = element.tagName.toLowerCase();
    if (SKIP_TAGS.includes(element.tagName)) continue;
    const blockId = blockIdOf(element, blocks, root);
    const ordinalKey = `${blockId}|${tag}`;
    const ordinal = tagOrdinal.get(ordinalKey) || 0;
    tagOrdinal.set(ordinalKey, ordinal + 1);
    const baseId = `${blockId}.${tag}.${ordinal}`;

    // 文本：只取该元素的直接文本子节点，避免把子元素的内容算到父元素头上
    let textIndex = 0;
    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType !== 3) continue;
      const text = normalizeText(child.nodeValue);
      if (!translatable(text)) continue;
      entries.push({
        id: textIndex === 0 ? baseId : `${baseId}~${textIndex}`,
        kind: 'text',
        text,
        node: child,
        element,
      });
      textIndex += 1;
    }

    // 属性：ID 锚在元素上，加 @属性名
    for (const [attr, text] of translatableAttrsOf(element)) {
      entries.push({ id: `${baseId}@${attr}`, kind: 'attr', attr, text, element });
    }
  }
  return entries;
}

function walkEntries(html) {
  const doc = parseFragment(html);
  return walkEntriesInRoot(doc.getElementById('alsvid-root'));
}

/** 可翻译单元清单（不含 DOM 引用，可安全用于 React state） */
export function contentEntries(html) {
  return walkEntries(html).map(({ id, kind, attr, text }) => ({ id, kind, attr, text }));
}

/**
 * 画布文案清单。按 ID 逐条列出——同一句中文出现在两处就是两条，
 * 因为语境不同（按钮 vs 正文）本来就该分开翻。省事靠翻译记忆，不靠合并。
 */
export function canvasStrings(html) {
  return contentEntries(html).map(({ id, kind, attr, text }) => ({ id, kind, attr, text, count: 1 }));
}

// 取值：兼容三种形态——新格式 {src,dst}、旧格式纯字符串、缺失
export function translationValue(dict, id, text) {
  const hit = dict ? dict[id] : undefined;
  if (hit && typeof hit === 'object') return normalizeText(hit.dst);
  if (typeof hit === 'string') return normalizeText(hit);
  // 旧格式兜底：万一还没迁移，至少不要让页面直接露出中文
  const legacy = dict ? dict[text] : undefined;
  if (legacy && typeof legacy === 'object') return normalizeText(legacy.dst);
  return typeof legacy === 'string' ? normalizeText(legacy) : '';
}

/** 单条译文的健康状态：缺译文 / 原文已改需更新 / 正常 */
export function entryStatus(dict, entry) {
  const hit = dict ? dict[entry.id] : undefined;
  const value = translationValue(dict, entry.id, entry.text);
  if (!value) return TRANSLATION_STATUS.missing;
  if (hit && typeof hit === 'object' && normalizeText(hit.src) && normalizeText(hit.src) !== entry.text) {
    return TRANSLATION_STATUS.needsUpdate;
  }
  // 旧格式没有 src，无法判断是否过期，按正常处理（迁移时会补齐）
  return TRANSLATION_STATUS.ok;
}

/** 缺译文或原文已改的条目（发布门禁与面板提示都用它） */
export function pendingEntries(entries, dict) {
  return entries.filter(entry => entryStatus(dict, entry) !== TRANSLATION_STATUS.ok);
}

/** 覆盖率：只统计「有译文且原文没变」的条目，过期的译文不算完成 */
export function coverageOf(entries, dict) {
  if (!entries.length) return 100;
  const done = entries.filter(entry => entryStatus(dict, entry) === TRANSLATION_STATUS.ok).length;
  return Math.round(done * 100 / entries.length);
}

/** 用文本层渲染该语言页面；缺译文的节点包一层虚线标记，一眼看出差哪几条 */
export function translateHtml(html, dict) {
  const doc = parseFragment(html), root = doc.getElementById('alsvid-root');
  if (!root) return '';
  // 直接在这份 document 的 root 上遍历：改的节点就是最后要读 innerHTML 的节点。
  // （曾写成先 walkEntries(html) 再 walkEntries(root.innerHTML)，两次解析得到两份
  //  document，改的是副本，返回的却还是原件 —— 表现为「翻译完全不生效」且不报错。）
  for (const entry of walkEntriesInRoot(root)) {
    const value = translationValue(dict, entry.id, entry.text);
    if (value) {
      if (entry.kind === 'text') {
        // 不能写成 raw.replace(text, value)：清单里的 key 经过空白归一化，
        // 而原文常带全角空格（如「探索整车　→」），replace 找不到就会静默不替换。
        const raw = entry.node.nodeValue;
        const lead = (raw.match(/^\s*/) || [''])[0], tail = (raw.match(/\s*$/) || [''])[0];
        entry.node.nodeValue = lead + value + tail;
      } else {
        entry.element.setAttribute(entry.attr, value);
      }
    } else if (entry.kind === 'text') {
      // 已经处在待翻译标记里就不再套一层：否则对已渲染结果再渲染一次会嵌套出
      // 多层 span，虚线框越来越粗，标记数量也翻倍。
      const parent = entry.node.parentElement;
      if (parent && parent.classList && parent.classList.contains('alsvid-untranslated')) continue;
      const mark = doc.createElement('span');
      mark.className = 'alsvid-untranslated';
      mark.setAttribute('data-untranslated', entry.text);
      mark.title = '待翻译：' + entry.text;
      mark.textContent = entry.node.nodeValue;
      entry.node.parentNode.replaceChild(mark, entry.node);
    }
  }
  return root.innerHTML;
}

export function localeDocument(html, css, dict) {
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + (css || '') +
    '</style><style>.alsvid-untranslated{outline:1px dashed #d97706;outline-offset:2px;background:rgba(253,230,138,.16)}</style></head><body>' +
    translateHtml(html, dict) + '</body></html>';
}

// ── 旧数据迁移 ────────────────────────────────────────────────────────────
// 旧格式 { '中文原文': '译文' } → 新格式 { '<id>': {src:'中文原文', dst:'译文'} }。
// 因为快照 HTML 没变，每个旧 key 都能反查到唯一 ID；反查不到的（区块已被删除）
// 计入 orphaned，由调用方提示，不静默丢弃。
export function migrateLegacyTranslations(html, legacy) {
  const entries = contentEntries(html);
  const byText = new Map();
  for (const entry of entries) {
    if (!byText.has(entry.text)) byText.set(entry.text, []);
    byText.get(entry.text).push(entry.id);
  }
  const out = {};
  const stats = { migrated: 0, orphaned: 0, kept: 0 };
  for (const [code, table] of Object.entries(legacy || {})) {
    if (!table || typeof table !== 'object') { out[code] = {}; continue; }
    const values = Object.values(table);
    const alreadyNew = values.some(v => v && typeof v === 'object' && !Array.isArray(v));
    if (alreadyNew) { out[code] = table; stats.kept += Object.keys(table).length; continue; }
    const next = {};
    for (const [text, dst] of Object.entries(table)) {
      if (typeof dst !== 'string' || !dst.trim()) continue;
      const ids = byText.get(normalizeText(text)) || [];
      if (!ids.length) { stats.orphaned += 1; continue; }
      // 同一句原文可能对应多个 ID：全部填上，符合「翻译一次、多处生效」的预期
      for (const id of ids) next[id] = { src: normalizeText(text), dst };
      stats.migrated += 1;
    }
    out[code] = next;
  }
  return { translations: out, stats };
}

// 按 data-alsvid-block 找区块。
// 注意：不能用 getWrapper().find('[data-alsvid-block]')——grapesjs 的 find 是
// jQuery 的 DOM 查询（this.view.$el.find(query)），依赖画布已渲染，且不包含自身；
// 刚 setComponents 或画布未挂载时恒返回空数组。这里直接遍历组件模型树。
export function findBlocks(editor, key) {
  const out = [];
  const wrapper = editor?.getWrapper?.();
  if (!wrapper) return out;
  const walk = parent => {
    const kids = parent.components?.();
    if (!kids || typeof kids.forEach !== 'function') return;
    kids.forEach(comp => {
      const block = (comp.getAttributes?.() || {})['data-alsvid-block'];
      if (block && (!key || block === key)) out.push(comp);
      walk(comp);
    });
  };
  walk(wrapper);
  return out;
}

// 给自动生成的区块起中文名，并展开两层，图层列表才看得懂（只影响图层显示，不改页面）
// 注意：grapesjs 的图层名取自 custom-name（setName），不是 name
export function nameLayers(editor) {
  const wrapper = editor?.getWrapper?.();
  if (!wrapper) return;
  try {
    const labelOf = (comp, depth) => {
      const key = (comp.getAttributes?.() || {})['data-alsvid-block'];
      if (BLOCK_LABELS[key]) return BLOCK_LABELS[key];
      // 只给页面主容器及其直接子节点按 class 兜底，避免把深层 div 也刷成中文名
      if (depth > 2) return '';
      const own = comp.getClasses?.() || [];
      const attr = String((comp.getAttributes?.() || {}).class || '');
      const classes = own.length ? own : attr.split(/\s+/).filter(Boolean);
      for (const name of classes) if (CLASS_LABELS[name]) return CLASS_LABELS[name];
      return '';
    };
    const visit = (comp, depth) => {
      // getName() 在没有自定义名时会回退成标签名（Section/Div），必须用 custom-name 判断是否已命名
      const label = labelOf(comp, depth);
      if (label && !comp.get('custom-name')) comp.setName(label);
      const kids = comp.components?.();
      if (!kids || typeof kids.forEach !== 'function') return;
      kids.forEach(child => visit(child, depth + 1));
    };
    const kids = wrapper.components?.();
    if (kids && typeof kids.forEach === 'function') kids.forEach(child => visit(child, 1));
    // 图层面板的“展开”状态就是组件自身的 open 属性；
    // 根节点“页面”是 wrapper 本身，只展开它的子节点是看不到内容的，必须连 wrapper 一起打开。
    // 只展开两层（页面 → 容器 → 各区块），再往下交给用户自己点，否则树会拉得很长。
    const expand = (comp, depth) => {
      const list = comp.components?.();
      if (!list || typeof list.forEach !== 'function' || !list.length) return;
      if (depth > 1) return;
      comp.set('open', true);
      list.forEach(child => expand(child, depth + 1));
    };
    expand(wrapper, 0);
  } catch (_) { /* 命名只是可读性优化，失败不影响编辑 */ }
}
