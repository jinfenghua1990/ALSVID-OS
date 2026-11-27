import test from 'node:test';
import assert from 'node:assert/strict';
import { selectHomepageBlock } from '../src/pages/homepage-block-selection.js';

test('首页模块优先选择明确归属，不修改其他模块', () => {
  const blocks=[{id:'a',moduleId:'other',componentKey:'hero'},{id:'b',moduleId:'target',componentKey:'hero'}];
  assert.equal(selectHomepageBlock(blocks,'target',0,['hero']).block.id,'b');
  assert.deepEqual(selectHomepageBlock(blocks,'missing',0,['hero']),{block:null,ambiguous:false});
});
test('旧内容只有槽位和类型均唯一匹配才可编辑', () => {
  const old={id:'old',componentKey:'hero'};
  assert.equal(selectHomepageBlock([old],'target',0,['hero']).block,old);
  assert.equal(selectHomepageBlock([{id:'x',componentKey:'features'},old],'target',0,['hero']).ambiguous,true);
  assert.equal(selectHomepageBlock([old,{id:'second',componentKey:'hero'}],'target',0,['hero']).ambiguous,true);
  assert.equal(selectHomepageBlock([{...old,moduleId:'target'},{id:'x',moduleId:'target'}],'target',0,['hero']).ambiguous,true);
});
