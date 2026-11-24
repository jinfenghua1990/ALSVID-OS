-- 182: 术语库 + 翻译记忆
--
-- 背景：自动翻译原本把「品牌词保护」硬编码在 storefront-translate.js 里，
-- 运营改不了；同一句文案在第二个页面出现时又要重新送引擎翻一遍，既慢又可能
-- 给出与上次不一致的译法。两张表分别解决这两件事：
--
--   translation_glossary  kind='protect' → 任何语言下都不许翻译的字符串（品牌、型号）
--                         kind='prefer'  → 指定语言下的固定译法（折叠车 → Faltrad）
--   translation_memory    「原文 → 译文」的复用记录，命中就不再调引擎
--
-- 记忆只按 (原文, 语言) 唯一：同一句原文在任何页面都应得到同一个译文，
-- 语境差异由人工在翻译面板逐条改写，改写后写回记忆，后续页面自动继承。
BEGIN;

CREATE TABLE IF NOT EXISTS alsvid_v2.translation_glossary (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  term text NOT NULL CHECK (length(btrim(term)) BETWEEN 1 AND 200),
  -- '*' = 所有目标语言通用（品牌词）；具体语言用于固定译法
  locale text NOT NULL DEFAULT '*' CHECK (locale IN ('*', 'en', 'de')),
  kind text NOT NULL CHECK (kind IN ('protect', 'prefer')),
  translation text CHECK (translation IS NULL OR length(translation) <= 400),
  note text CHECK (note IS NULL OR length(note) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (term, locale, kind),
  -- protect 不带译文；prefer 必须是某个具体语言且译文非空，否则这条规则没有意义
  CHECK (kind <> 'protect' OR translation IS NULL),
  CHECK (kind <> 'prefer' OR (locale <> '*' AND translation IS NOT NULL AND length(btrim(translation)) > 0))
);

CREATE TABLE IF NOT EXISTS alsvid_v2.translation_memory (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  -- sha256(归一化原文) 前 32 位：原文很长时索引仍然很短
  source_hash text NOT NULL CHECK (length(source_hash) = 32),
  source_text text NOT NULL,
  locale text NOT NULL CHECK (locale IN ('en', 'de')),
  target_text text NOT NULL,
  -- 产出这条译文的引擎；manual 表示人工在面板里改过，优先级最高
  engine text,
  hits integer NOT NULL DEFAULT 0 CHECK (hits >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_hash, locale)
);

CREATE INDEX IF NOT EXISTS translation_memory_locale_idx
  ON alsvid_v2.translation_memory(locale, updated_at DESC);

-- 品牌与型号：出厂默认值。运营后续可在后台增删，这里只是别让新库一开始就裸奔。
INSERT INTO alsvid_v2.translation_glossary(term, locale, kind, note) VALUES
  ('ALSVID', '*', 'protect', '品牌名，任何语言都不翻译'),
  ('A1 Ultra', '*', 'protect', '车型号'),
  ('A1 Carbon', '*', 'protect', '车型号'),
  ('L1 PRO', '*', 'protect', '车型号'),
  ('L1 Carbon', '*', 'protect', '车型号')
ON CONFLICT (term, locale, kind) DO NOTHING;

COMMIT;
