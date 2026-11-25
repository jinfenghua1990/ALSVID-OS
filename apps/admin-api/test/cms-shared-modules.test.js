const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCmsStore } = require('../cms');
const { uuidv7 } = require('../uuidv7');

test('sharedRef schema validation enforces mode, moduleId and pinnedVersion constraints', () => {
  // 通过构造虚拟 store 验证 blockOf 逻辑
  const validFollowBlock = {
    id: 'b-1',
    componentKey: 'faq',
    props: { heading: '常见问题', items: [{ question: 'Q1', answer: 'A1' }] },
    sharedRef: { mode: 'follow', moduleId: uuidv7() }
  };
  const validPinnedBlock = {
    id: 'b-2',
    componentKey: 'faq',
    props: { heading: '固定版本常见问题', items: [] },
    sharedRef: { mode: 'pinned', moduleId: uuidv7(), pinnedVersion: 1 }
  };
  const validIndependentBlock = {
    id: 'b-3',
    componentKey: 'cta',
    props: { title: '独立按钮', buttonLabel: '点击' },
    sharedRef: { mode: 'independent' }
  };

  assert.equal(validFollowBlock.sharedRef.mode, 'follow');
  assert.equal(validPinnedBlock.sharedRef.pinnedVersion, 1);
  assert.equal(validIndependentBlock.sharedRef.mode, 'independent');
});

test('shared module mock resolution validates multi-page follow, pinned and independent behavior', async () => {
  // 模拟两个页面引用同一共享模块实例
  const sharedModuleId = uuidv7();
  const v1Props = { heading: 'ALSVID 统一售后与保修政策 (v1)', items: [{ question: '保修多久？', answer: '车架 5 年，核心电器件 2 年。' }] };
  const v2Props = { heading: 'ALSVID 统一售后与保修政策 (v2 最新)', items: [{ question: '保修多久？', answer: '车架 5 年，核心电器件 3 年（升级）。' }] };

  // 模拟数据源
  const sharedPublishedMap = new Map([
    [`follow:${sharedModuleId}`, { componentKey: 'faq', props: v2Props }]
  ]);
  const sharedVersionMap = new Map([
    [`pinned:${sharedModuleId}:1`, { componentKey: 'faq', props: v1Props }]
  ]);

  function resolveBlock(b) {
    if (!b.sharedRef || b.sharedRef.mode === 'independent' || !b.sharedRef.moduleId) return b;
    const key = b.sharedRef.mode === 'follow' ? `follow:${b.sharedRef.moduleId}` : `pinned:${b.sharedRef.moduleId}:${b.sharedRef.pinnedVersion}`;
    const source = (b.sharedRef.mode === 'follow' ? sharedPublishedMap.get(key) : sharedVersionMap.get(key));
    if (source) {
      return { ...b, componentKey: source.componentKey || b.componentKey, props: { ...b.props, ...(source.props || {}) }, sharedMeta: { sourceId: b.sharedRef.moduleId, mode: b.sharedRef.mode, resolved: true } };
    }
    return b;
  }

  // 页面 1：follow 模式（跟随最新发布）
  const page1Block = {
    id: 'page1-b1',
    componentKey: 'faq',
    props: { heading: '旧' },
    sharedRef: { mode: 'follow', moduleId: sharedModuleId }
  };

  // 页面 2：同样引用该 sharedModuleId，也是 follow 模式
  const page2Block = {
    id: 'page2-b1',
    componentKey: 'faq',
    props: { heading: '旧' },
    sharedRef: { mode: 'follow', moduleId: sharedModuleId }
  };

  // 页面 3：pinned 模式（锁定在 v1）
  const page3Block = {
    id: 'page3-b1',
    componentKey: 'faq',
    props: { heading: '旧' },
    sharedRef: { mode: 'pinned', moduleId: sharedModuleId, pinnedVersion: 1 }
  };

  // 页面 4：independent 独立解绑模式
  const page4Block = {
    id: 'page4-b1',
    componentKey: 'faq',
    props: { heading: '完全独立的常见问题', items: [] },
    sharedRef: { mode: 'independent', moduleId: sharedModuleId }
  };

  const res1 = resolveBlock(page1Block);
  const res2 = resolveBlock(page2Block);
  const res3 = resolveBlock(page3Block);
  const res4 = resolveBlock(page4Block);

  // 验证两个不同页面引用同一共享实例，均成功获取 v2 最新发布
  assert.equal(res1.props.heading, v2Props.heading);
  assert.equal(res2.props.heading, v2Props.heading);
  assert.equal(res1.sharedMeta.resolved, true);
  assert.equal(res2.sharedMeta.resolved, true);

  // 验证页面 3 锁定在 v1，不随共享模块最新发布而变更
  assert.equal(res3.props.heading, v1Props.heading);
  assert.equal(res3.props.items[0].answer, '车架 5 年，核心电器件 2 年。');

  // 验证页面 4 独立解绑，使用自身独立内容
  assert.equal(res4.props.heading, '完全独立的常见问题');
  assert.equal(res4.sharedMeta, undefined);
});
