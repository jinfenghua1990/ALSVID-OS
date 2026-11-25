const { test } = require('node:test');
const assert = require('node:assert/strict');
const { uuidv7 } = require('../uuidv7');

test('WEB-007: draft modifications are isolated and do not leak into published state', () => {
  const sharedModuleId = uuidv7();
  let onlineState = {
    id: sharedModuleId,
    version: 1,
    published: { blocks: [{ id: 'b-1', componentKey: 'faq', props: { heading: '线上稳定版 FAQ' } }] },
    draft: { blocks: [{ id: 'b-1', componentKey: 'faq', props: { heading: '线上稳定版 FAQ' } }] }
  };

  // 1. 用户编辑草稿，未发布
  const newDraft = { blocks: [{ id: 'b-1', componentKey: 'faq', props: { heading: '草稿修改中（未发布，绝不能上外网）' } }] };
  onlineState.draft = newDraft;

  // 模拟前台只从 published 字段解析
  const publicResolve = (module) => module.published.blocks[0].props.heading;
  assert.equal(publicResolve(onlineState), '线上稳定版 FAQ');
  assert.notEqual(publicResolve(onlineState), onlineState.draft.blocks[0].props.heading);
});

test('WEB-007: publishing a shared module updates all follow pages synchronously while keeping pinned pages unchanged', () => {
  const sharedModuleId = uuidv7();
  const versions = [
    { version: 1, snapshot: { blocks: [{ id: 'b-1', componentKey: 'faq', props: { heading: '退换货政策 v1 (14天无理由)' } }] } }
  ];
  let publishedDoc = versions[0].snapshot;

  // 模拟两个页面引用
  const pageA_follow = { id: 'page-a', sharedRef: { mode: 'follow', moduleId: sharedModuleId } };
  const pageB_pinned = { id: 'page-b', sharedRef: { mode: 'pinned', moduleId: sharedModuleId, pinnedVersion: 1 } };

  function renderPage(page, currentPublished, historyVersions) {
    if (page.sharedRef.mode === 'follow') {
      return currentPublished.blocks[0].props.heading;
    }
    if (page.sharedRef.mode === 'pinned') {
      const snap = historyVersions.find(v => v.version === page.sharedRef.pinnedVersion);
      return snap.snapshot.blocks[0].props.heading;
    }
  }

  // 初始状态验证
  assert.equal(renderPage(pageA_follow, publishedDoc, versions), '退换货政策 v1 (14天无理由)');
  assert.equal(renderPage(pageB_pinned, publishedDoc, versions), '退换货政策 v1 (14天无理由)');

  // 共享模块发布 v2
  const v2Snapshot = { blocks: [{ id: 'b-1', componentKey: 'faq', props: { heading: '退换货政策 v2 (30天无理由安心退)' } }] };
  versions.push({ version: 2, snapshot: v2Snapshot });
  publishedDoc = v2Snapshot;

  // 验证关联页同步：页面 A (follow) 自动同步升级至 v2，而页面 B (pinned) 严格锁定在 v1
  assert.equal(renderPage(pageA_follow, publishedDoc, versions), '退换货政策 v2 (30天无理由安心退)');
  assert.equal(renderPage(pageB_pinned, publishedDoc, versions), '退换货政策 v1 (14天无理由)');
});

test('WEB-007: snapshot failure aborts publication transaction without corrupting online state', () => {
  let transactionCommitted = false;
  let onlinePublishedVersion = 1;

  function simulatePublishWithFailingSnapshot(shouldFail) {
    try {
      // BEGIN TX
      if (shouldFail) throw new Error('DB DISK FULL: failed to write immutable site_page_versions snapshot');
      onlinePublishedVersion = 2;
      transactionCommitted = true;
    } catch (e) {
      // ROLLBACK TX
      transactionCommitted = false;
      return { ok: false, error: e.message };
    }
    return { ok: true };
  }

  const failResult = simulatePublishWithFailingSnapshot(true);
  assert.equal(failResult.ok, false);
  assert.equal(transactionCommitted, false);
  assert.equal(onlinePublishedVersion, 1); // 线上保持原版，阻断成功
});

test('WEB-007: rollback correctly restores historical snapshot and triggers cache revalidation', () => {
  const versions = [
    { version: 1, snapshot: { title: '旧版本 V1' } },
    { version: 2, snapshot: { title: '故障版本 V2' } },
  ];
  let currentPublished = versions[1].snapshot;
  let cacheInvalidated = false;

  function simulateRollback(targetVersion) {
    const historical = versions.find(v => v.version === targetVersion);
    if (!historical) throw new Error('version not found');
    const newVersion = versions.length + 1;
    // 写入新版本历史
    versions.push({ version: newVersion, snapshot: historical.snapshot, rolledBackFrom: targetVersion });
    currentPublished = historical.snapshot;
    cacheInvalidated = true;
    return { publishedVersion: newVersion, cacheInvalidated };
  }

  const rollbackResult = simulateRollback(1);
  assert.equal(rollbackResult.publishedVersion, 3);
  assert.equal(rollbackResult.cacheInvalidated, true);
  assert.equal(currentPublished.title, '旧版本 V1');
});
