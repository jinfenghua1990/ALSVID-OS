const {test}=require('node:test');
const assert=require('node:assert/strict');
const {siteShellOf,assertShellDocument}=require('../cms');
test('optional marketing defaults to disabled; valid content normalized',()=>{
 assert.deepEqual(siteShellOf({kind:'announcement',text:' Sale ',href:'/de/e-bikes'}),{kind:'announcement',enabled:false,text:'Sale',href:'/de/e-bikes'});
});
test('reject unsafe global navigation links and wrong area types',()=>{
 for(const href of ['javascript:alert(1)','//example.com','/\\example.com'])assert.throws(()=>siteShellOf({kind:'header',links:[{label:'bad',href}]}));
 assert.throws(()=>assertShellDocument('/site-shell/footer','custom',{blocks:[],siteShell:{kind:'footer'}}));
 assert.throws(()=>assertShellDocument('/site-shell/footer','shared_module',{blocks:[],siteShell:{kind:'header'}}));
 assert.doesNotThrow(()=>assertShellDocument('/site-shell/footer','shared_module',{blocks:[],siteShell:{kind:'footer'}}));
});
