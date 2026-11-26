import test from 'node:test';
import assert from 'node:assert/strict';
import {modulesFor,SHELL_MODULES,editorKey,shellValue,shellState,DESIGN_LOCALES,DESIGN_DEVICES} from '../src/pages/design-module-registry.js';

test('stable four-region modules are shared; detail uses P00 instead of G02',()=>{
 const ids=page=>modulesFor(page).map(x=>x.id.replace('ALSVID-',''));
 assert.deepEqual(ids('home'),['G01','G02','G03','G03-01','G03-02','G03-03','G03-04','G03-05','G04']);
 assert.deepEqual(ids('list'),['G01','G02','G03','L01','L02','L03','L04','L05','G04']);
 assert.deepEqual(ids('detail'),['G01','P00','G03','P01','P01-01','P01-02','P02','P04','P05','P06','P07','P08','P09','P10','G04']);
 assert.deepEqual(ids('transaction'),['G01','G02','G03','G04']);
 assert.equal(new Set(ids('detail')).size,ids('detail').length);
 assert.equal(modulesFor('unknown').length,0);
 assert.equal(SHELL_MODULES.filter(m=>m.kind).length,3);
});
test('global editor identity is scoped by module and language, not page',()=>{
 assert.equal(editorKey('ALSVID-G02','de'),'ALSVID-G02:de');
 assert.notEqual(editorKey('ALSVID-G02','de'),editorKey('ALSVID-G02','en'));
 assert.equal(editorKey('ALSVID-G03','de'),null);
 assert.equal(editorKey('ALSVID-P03','de'),null);
 assert.equal(editorKey('ALSVID-G02','fr'),null);
 assert.equal(DESIGN_LOCALES.length*DESIGN_DEVICES.length,6);
});
test('editor loads a detached draft first, then published fallback; wrong types fail',()=>{
 const draft={kind:'header',brand:'draft',links:[]},published={kind:'header',brand:'live',links:[]};
 const value=shellValue({draft:{siteShell:draft},published:{siteShell:published}},'header');
 value.links.push({label:'New',href:'/de'});
 assert.equal(draft.links.length,0);
 assert.equal(value.brand,'draft');
 assert.equal(shellValue({published:{siteShell:published}},'header').brand,'live');
 assert.equal(shellValue(null,'announcement').enabled,false);
 assert.throws(()=>shellValue({draft:{siteShell:published}},'footer'),/不匹配/);
});
test('draft and published status reflect revision rather than treating all existing drafts as pending',()=>{
 const doc={status:'active',revision:4,publishedRevision:4,publishedVersion:2,draft:{},published:{siteShell:{kind:'announcement',enabled:false}}};
 assert.deepEqual(shellState(doc),{published:'v2',draft:'—',enabled:'关闭'});
 assert.equal(shellState({...doc,revision:5}).draft,'待发布');
 assert.equal(shellState(null).draft,'未创建');
});
