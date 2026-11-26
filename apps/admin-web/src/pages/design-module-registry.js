// Stable IDs follow docs/storefront-module-ids.md; retired IDs are never reused.
const shell=(id,name,kind)=>({id:'ALSVID-'+id,name,kind,scope:'shared',path:'/site-shell/'+kind});
const item=(id,name,scope='page')=>({id:'ALSVID-'+id,name,scope});
export const SHELL_MODULES=[shell('G01','营销公告栏','announcement'),shell('G02','顶部导航栏','header'),item('G03','页面主体容器','structural'),shell('G04','公共页脚','footer')];
export const PAGE_MODULES={
 home:[
   item('G03-01','车型宣传单元 · 主推款'),
   item('G03-02','车型宣传单元 · 第二款 / 场景款'),
   item('G03-03','车型宣传单元 · 第三款 / 性能款'),
   item('G03-04','矩阵式车型陈列 / 对比选车'),
   item('G03-05','品牌故事与生态背书')
 ],
 list:[item('L01','分类导航'),item('L02','整车展示与快速购买'),item('L03','配件与增值服务商品'),item('L04','服务与支持'),item('L05','车型对比')],
 detail:[{...item('P00','商品专属吸顶导航','structural')},item('P01','车型选配与核心参数','product'),item('P01-01','交互式车型选配','product'),item('P01-02','四项核心参数','product'),item('P02','商品主视觉与营销','product'),item('P04','沉浸式产品图文','product'),item('P05','完整技术参数','product'),item('P06','包装清单','product'),item('P07','产品下载','product'),item('P08','常见问题','product'),item('P09','售后保障','product'),item('P10','配送服务','product')],
 transaction:[],
};
export const EDITABLE_PAGE_MODULES=[{id:'ALSVID-L01',name:'分类导航',scope:'page',editor:'catalog-layout',pageType:'product_template',path:'/products'}, {id:'ALSVID-L02',name:'整车展示与快速购买',scope:'page',editor:'catalog-layout',pageType:'product_template',path:'/products'}, {id:'ALSVID-L03',name:'配件与增值服务商品',scope:'page',editor:'catalog-layout',pageType:'product_template',path:'/products'}, {id:'ALSVID-L04',name:'服务与支持',scope:'page',editor:'catalog-layout',pageType:'product_template',path:'/products'},...PAGE_MODULES.home.map(module=>({...module,editor:'homepage-block',pageType:'home',path:'/'})),...PAGE_MODULES.detail.slice(1).map(module=>({...module,editor:'product-listing'}))];
export const DESIGN_LOCALES=[['zh','中文'],['en','英文'],['de','德文']];
export const DESIGN_DEVICES=[['desktop','PC'],['mobile','移动端']];
export function modulesFor(page){
 if(!Object.hasOwn(PAGE_MODULES,page))return [];
 const modules=['home','list','detail'].includes(page)?PAGE_MODULES[page].map(module=>pageModule(module.id)||module):PAGE_MODULES[page];
 return [...SHELL_MODULES.slice(0,1),...(page==='detail'?[]:SHELL_MODULES.slice(1,2)),...(page==='detail'?modules.slice(0,1):[]),SHELL_MODULES[2],...(page==='detail'?modules.slice(1):modules),SHELL_MODULES[3]];
}
export function shellModule(id){return SHELL_MODULES.find(m=>m.id===id&&m.kind)||null}
export function pageModule(id){return EDITABLE_PAGE_MODULES.find(m=>m.id===id)||null}
export function editorKey(id,locale){if(!shellModule(id)||!DESIGN_LOCALES.some(([code])=>code===locale))return null;return id+':'+locale}
export function blankShell(kind){if(kind==='announcement')return {kind,enabled:false,text:'',href:''};if(kind==='header')return {kind,brand:'',links:[]};if(kind==='footer')return {kind,brand:'',groups:[]};throw Error('未知全局模块')}
export function shellValue(page,kind){
 const v=page?.draft?.siteShell||page?.published?.siteShell;
 if(v&&v.kind!==kind)throw Error('装修记录与模块不匹配');
 return v?JSON.parse(JSON.stringify(v)):blankShell(kind);
}
export function shellState(page){
 if(!page)return {published:'—',draft:'未创建',enabled:'未配置'};
 const hasDraft=Boolean(page.draft||page.hasDraft)&&(!page.publishedVersion||page.revision!==page.publishedRevision);
 const published=page.published?.siteShell;
 const enabled=page.status!=='active'?'停用':!page.publishedVersion?'未发布':published?.kind==='announcement'?(published.enabled?'启用':'关闭'):'已发布';
 return {published:page.publishedVersion?'v'+page.publishedVersion:'未发布',draft:hasDraft?'待发布':'—',enabled};
}
